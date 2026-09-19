import type { Buffer } from "node:buffer";

import type { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import type { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { ScannedDocument } from "../../../platform/shared/documents/scanned-document.js";
import type { DocumentStore } from "../../../platform/storage/document-store.js";
import type { Clock } from "../../../platform/time/clock.js";
import type { PaymentMandate } from "../domain/entities/payment-mandate.js";
import { MandateNotFoundError } from "../domain/errors/mandate-errors.js";
import { MandateProofChangedError } from "../domain/errors/mandate-proof-errors.js";
import type { MandateActorChannel } from "../domain/events/payment-mandate-facts.js";
import { MandateProofAttachedEvent } from "../domain/events/payment-mandate.events.js";
import type { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import { discardUnrecordedProof, purgeProof } from "./mandate-proof-purge.js";
import { mandateCompanyOf } from "./mandate-journal-names.js";

/** Les ports du dépôt de scan — partagés par le staff et le client. */
export interface MandateProofDeps {
  readonly mandates: PaymentMandateRepository;
  readonly store: DocumentStore;
  readonly cipher: FieldCipher;
  readonly clock: Clock;
  readonly events: DomainEventPublisher;
  readonly uow: UnitOfWork;
}

/** Le fichier reçu, et qui l'envoie. */
export interface MandateProofUpload {
  readonly companyId: string;
  readonly fileName: string;
  readonly bytes: Buffer;
  readonly via: MandateActorChannel;
}

/**
 * Dépose le scan signé **sur le brouillon seulement** — sans mur : l'appelant
 * a déjà décidé du droit d'agir. Extrait le 2026-09-14 d'`AttachMandateProofHandler`
 * pour servir aussi le client.
 *
 * Quatre temps, dans cet ordre, et chacun ferme une panne :
 *
 * 1. **Refuser avant de ranger.** Le refus hors brouillon tombait, jusqu'au
 *    2026-09-14, APRÈS l'écriture dans le bucket.
 * 2. **Ranger sous une clé neuve.** Une clé fixe faisait qu'un dépôt dont
 *    l'écriture en base échoue écrasait la pièce que la base désignait encore.
 * 3. **Écrire la référence sous condition, et sa trace, ensemble** (depuis le
 *    2026-09-15) : le mandat doit être encore brouillon et porter la pièce
 *    chargée. Sinon `MandateProofChangedError`, et la pièce qu'on vient de
 *    ranger est retirée — personne ne la désignera jamais.
 * 4. **Purger l'ancienne pièce, après la validation seulement** — un scan de
 *    brouillon remplacé n'a jamais prouvé de consentement (plan
 *    `documentation/comptabilite/plan-restes-du-mandat.md` §4).
 *
 * `@hors-transaction` pour le rangement et la purge, comme le KBIS : le stockage
 * objet n'a pas de transaction. Une transaction qui échoue pour une autre
 * raison laisse la pièce rangée orpheline — dit et accepté (plan mandat client
 * §8) : une erreur de validation ne dit pas si la ligne a été écrite, et
 * retirer l'objet sur un doute pourrait détruire une pièce désignée.
 *
 * @returns le brouillon prouvé, pour que l'appelant puisse prévenir l'équipe.
 * @throws {MandateProofChangedError} un autre geste est passé entre la lecture
 *   et l'écriture.
 */
export async function attachProofToDraft(
  deps: MandateProofDeps,
  upload: MandateProofUpload,
): Promise<PaymentMandate> {
  const mandate = await provableMandate(deps.mandates, upload.companyId);
  // Le domaine valide le fichier EN CLAIR — type réel, taille, nom. Sceller
  // avant validerait des octets chiffrés, c'est-à-dire rien.
  const document = ScannedDocument.create(upload.fileName, upload.bytes);
  const previousKey = mandate.proofStorageKey();
  // Lue AVANT le dépôt, sur l'agrégat : c'est lui qui dit si l'ancienne pièce
  // a le droit de partir.
  const replacedKey = mandate.purgeableProofKey();

  // Scellé : le scan porte le nom du client, sa banque, son IBAN et sa
  // signature. `octet-stream` et non le vrai type — ce qui est rangé n'est plus
  // un PDF, et l'annoncer ferait croire à qui ouvre le bucket qu'il est lisible.
  const storageKey = await deps.store.save(
    proofKeyFor(upload.companyId, mandate.id, deps.clock.now()),
    { bytes: deps.cipher.sealBytes(document.bytes), contentType: "application/octet-stream" },
  );
  mandate.attachProof({ storageKey, fileName: document.fileName });
  await recordDeposit(deps, mandate, previousKey, upload);
  if (replacedKey !== null) {
    await purgeProof(deps, mandate, replacedKey, "proof_replaced");
  }
  return mandate;
}

/**
 * L'écriture conditionnelle et son fait, dans une unité de travail. Sur le
 * refus nommé, la pièce neuve est retirée avant que le refus ne remonte.
 */
async function recordDeposit(
  deps: MandateProofDeps,
  mandate: PaymentMandate,
  previousKey: string | null,
  upload: MandateProofUpload,
): Promise<void> {
  try {
    await deps.uow.run(async () => {
      await deps.mandates.depositProof(mandate, previousKey);
      await deps.events.publishTraced(
        new MandateProofAttachedEvent(
          mandate.id,
          await mandateCompanyOf(deps.mandates, upload.companyId),
          mandate.reference,
          mandate.toView().proofFileName,
          upload.via,
        ),
      );
    });
  } catch (error) {
    const deposited = mandate.proofStorageKey();
    if (error instanceof MandateProofChangedError && deposited !== null) {
      await discardUnrecordedProof(deps.store, mandate.id, deposited);
    }
    throw error;
  }
}

/**
 * Le brouillon de la société, refusé AVANT tout rangement s'il n'y en a pas.
 *
 * `findDraft` et non `findAwaitingProof` depuis le 2026-09-14 : ce dernier
 * retombe sur l'actif, dont la pièce ne doit plus bouger. Sans brouillon, le
 * refus nomme l'état réel du mandat courant — « déjà actif » ne se corrige pas
 * comme « aucun mandat ».
 */
async function provableMandate(
  mandates: PaymentMandateRepository,
  companyId: string,
): Promise<PaymentMandate> {
  const draft = await mandates.findDraft(companyId);
  if (draft !== null) {
    return draft;
  }
  const current = await mandates.findCurrent(companyId);
  if (current === null) {
    throw new MandateNotFoundError(companyId);
  }
  current.refuseUnlessProvable();
  // Inatteignable : un mandat courant qui accepte une preuve est un brouillon,
  // et `findDraft` l'aurait rendu. Refuser plutôt que ranger sur un doute.
  throw new MandateNotFoundError(companyId);
}

/**
 * Clé de stockage du scan — ancrée sur la société, sur le mandat **et** sur
 * l'instant du dépôt : un mandat remplacé garde sa preuve, et un dépôt ne
 * recouvre jamais le précédent.
 */
function proofKeyFor(companyId: string, mandateId: string, at: Date): string {
  return `companies/${companyId}/mandates/${mandateId}/mandat-signe-${at.getTime()}`;
}
