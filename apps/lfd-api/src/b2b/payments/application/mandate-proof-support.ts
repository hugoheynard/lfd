import type { Buffer } from "node:buffer";

import type { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import type { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { ScannedDocument } from "../../../platform/shared/documents/scanned-document.js";
import type { DocumentStore } from "../../../platform/storage/document-store.js";
import type { Clock } from "../../../platform/time/clock.js";
import type { PaymentMandate } from "../domain/entities/payment-mandate.js";
import { MandateNotFoundError } from "../domain/errors/mandate-errors.js";
import type { MandateActorChannel } from "../domain/events/payment-mandate-facts.js";
import { MandateProofAttachedEvent } from "../domain/events/payment-mandate.events.js";
import type { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";

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
 * Trois temps, dans cet ordre, et chacun ferme une panne :
 *
 * 1. **Refuser avant de ranger.** Le refus hors brouillon tombait, jusqu'au
 *    2026-09-14, APRÈS l'écriture dans le bucket.
 * 2. **Ranger sous une clé neuve.** Une clé fixe faisait qu'un dépôt dont
 *    l'écriture en base échoue écrasait la pièce que la base désignait encore.
 * 3. **Écrire la référence et sa trace, ensemble.** `@hors-transaction` pour le
 *    rangement, comme le KBIS : le stockage objet n'a pas de transaction. Si
 *    la transaction échoue, la pièce déposée reste orpheline dans le bucket —
 *    dit et accepté (plan §8), aucune archive n'est promise.
 *
 * @returns le brouillon prouvé, pour que l'appelant puisse prévenir l'équipe.
 */
export async function attachProofToDraft(
  deps: MandateProofDeps,
  upload: MandateProofUpload,
): Promise<PaymentMandate> {
  const mandate = await provableMandate(deps.mandates, upload.companyId);
  // Le domaine valide le fichier EN CLAIR — type réel, taille, nom. Sceller
  // avant validerait des octets chiffrés, c'est-à-dire rien.
  const document = ScannedDocument.create(upload.fileName, upload.bytes);

  // Scellé : le scan porte le nom du client, sa banque, son IBAN et sa
  // signature. `octet-stream` et non le vrai type — ce qui est rangé n'est plus
  // un PDF, et l'annoncer ferait croire à qui ouvre le bucket qu'il est lisible.
  const storageKey = await deps.store.save(
    proofKeyFor(upload.companyId, mandate.id, deps.clock.now()),
    { bytes: deps.cipher.sealBytes(document.bytes), contentType: "application/octet-stream" },
  );
  mandate.attachProof({ storageKey, fileName: document.fileName });
  await deps.uow.run(async () => {
    await deps.mandates.save(mandate);
    await deps.events.publishTraced(
      new MandateProofAttachedEvent(
        mandate.id,
        upload.companyId,
        mandate.reference,
        document.fileName,
        upload.via,
      ),
    );
  });
  return mandate;
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
