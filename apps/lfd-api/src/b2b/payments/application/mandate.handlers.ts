import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";
import type { PaymentMandateView } from "@lfd/contracts";

import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { DocumentStore } from "../../../platform/storage/document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { ScannedDocument } from "../../../platform/shared/documents/scanned-document.js";
import { MandateNotFoundError } from "../domain/errors/mandate-errors.js";
import type { PaymentMandate } from "../domain/entities/payment-mandate.js";
import { MandateGateway } from "../domain/mandate-gateway.js";
import { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import { AttachMandateProofCommand, RevokeMandateCommand } from "./mandate-commands.js";
import { GetCompanyMandateQuery } from "./mandate-queries.js";

/**
 * Révoque le mandat courant — **chez le prestataire d'abord**, ici ensuite.
 *
 * Ordre inverse du précédent, et pour la même raison : tant que le moyen de
 * paiement est attaché chez Stripe, un prélèvement peut partir. Marquer
 * « révoqué » chez nous en premier nous ferait croire l'autorisation retirée
 * alors qu'elle ne l'est pas.
 */
@CommandHandler(RevokeMandateCommand)
export class RevokeMandateHandler implements ICommandHandler<RevokeMandateCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly gateway: MandateGateway,
    private readonly clock: Clock,
  ) {}

  async execute(command: RevokeMandateCommand): Promise<void> {
    const mandate = await this.mandates.findCurrent(command.companyId);
    if (mandate === null) {
      throw new MandateNotFoundError(command.companyId);
    }
    // 🔴 Conditionnel depuis le 2026-09-12. L'appel était inconditionnel, et
    // c'était tenable tant que TOUT mandat venait de Stripe. Un mandat que nous
    // frappons n'a pas de moyen de paiement chez un tiers : le détacher
    // reviendrait à demander à Stripe d'oublier quelque chose qu'il n'a jamais
    // eu — au mieux un aller-retour réseau pour rien, au pire une erreur du
    // prestataire qui ferait échouer une révocation parfaitement légitime.
    //
    // L'ordre, lui, ne change pas : tant que le moyen de paiement est attaché,
    // un prélèvement peut partir. On détache d'abord quand il y a de quoi.
    const paymentMethodId = mandate.paymentMethodId;
    if (paymentMethodId !== null) {
      await this.gateway.revokeMandate(paymentMethodId);
    }
    mandate.revoke(this.clock.now());
    await this.mandates.save(mandate);
  }
}

/**
 * Dépose le mandat signé scanné — **sur le brouillon seulement**.
 *
 * Trois temps, dans cet ordre, et chacun ferme une panne :
 *
 * 1. **Refuser avant de ranger.** Le refus hors brouillon tombait, jusqu'au
 *    2026-09-14, APRÈS l'écriture dans le bucket : le fichier était déjà
 *    remplacé quand l'agrégat disait non.
 * 2. **Ranger sous une clé neuve.** Une clé fixe par mandat faisait qu'un dépôt
 *    dont l'écriture en base échoue écrasait quand même la pièce précédente,
 *    que la base continuait de désigner.
 * 3. **Écrire la référence.** Si le stockage échoue, la base ne pointe pas vers
 *    une pièce absente — un mandat qu'on croit prouvé sans l'être est pire
 *    qu'un mandat qu'on sait nu.
 */
@CommandHandler(AttachMandateProofCommand)
export class AttachMandateProofHandler implements ICommandHandler<AttachMandateProofCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly store: DocumentStore,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
  ) {}

  async execute(command: AttachMandateProofCommand): Promise<void> {
    const mandate = await this.provableMandate(command.companyId);
    // Le domaine valide le fichier EN CLAIR — type réel, taille, nom. Sceller
    // avant validerait des octets chiffrés, c'est-à-dire rien.
    const document = ScannedDocument.create(command.fileName, command.bytes);

    // 🔴 Scellé depuis le 2026-09-12. Le scan du mandat signé porte le nom du
    // client, sa banque, son IBAN et sa signature manuscrite — c'est la pièce la
    // plus lourde du dépôt, et elle partait en clair dans le bucket pendant que
    // les MÊMES données étaient scellées en colonne.
    //
    // `application/octet-stream` et non le vrai type : ce qui est rangé n'est
    // plus un PDF. Annoncer `application/pdf` sur des octets chiffrés ferait
    // qu'un outil de stockage tenterait de les prévisualiser, et surtout ferait
    // croire, à qui ouvre le bucket, que la pièce est lisible.
    const key = proofKeyFor(command.companyId, mandate.id, this.clock.now());
    const storageKey = await this.store.save(key, {
      bytes: this.cipher.sealBytes(document.bytes),
      contentType: "application/octet-stream",
    });
    mandate.attachProof({ storageKey, fileName: document.fileName });
    await this.mandates.save(mandate);
  }

  /**
   * Le brouillon de la société, refusé AVANT tout rangement s'il n'y en a pas.
   *
   * 🔴 `findDraft` et non `findAwaitingProof` depuis le 2026-09-14 :
   * `findAwaitingProof` retombe sur l'actif sans brouillon, et c'est
   * précisément le mandat dont la pièce ne doit plus bouger. Sans brouillon,
   * le refus nomme l'état réel du mandat courant — « déjà actif » ne se corrige
   * pas comme « aucun mandat ».
   */
  private async provableMandate(companyId: string): Promise<PaymentMandate> {
    const draft = await this.mandates.findDraft(companyId);
    if (draft !== null) {
      return draft;
    }
    const current = await this.mandates.findCurrent(companyId);
    if (current === null) {
      throw new MandateNotFoundError(companyId);
    }
    current.refuseUnlessProvable();
    // Inatteignable : un mandat courant qui accepte une preuve est un brouillon,
    // et `findDraft` l'aurait rendu. Refuser plutôt que ranger sur un doute.
    throw new MandateNotFoundError(companyId);
  }
}

/**
 * Le mandat courant d'une société, ou `null`.
 *
 * `null` n'est pas une erreur : « pas de mandat » est un état normal de fiche —
 * la plupart des clients paient à la commande et n'en auront jamais.
 */
@QueryHandler(GetCompanyMandateQuery)
export class GetCompanyMandateHandler implements IQueryHandler<
  GetCompanyMandateQuery,
  PaymentMandateView | null
> {
  constructor(private readonly mandates: PaymentMandateRepository) {}

  async execute(query: GetCompanyMandateQuery): Promise<PaymentMandateView | null> {
    const mandate = await this.mandates.findCurrent(query.companyId);
    return mandate?.toView() ?? null;
  }
}

/**
 * Clé de stockage du mandat signé — ancrée sur la société, sur le mandat **et**
 * sur l'instant du dépôt.
 *
 * La société et le mandat : un mandat remplacé garde sa preuve, sinon
 * l'historique perdrait la seule pièce qui le justifie. L'instant : un dépôt ne
 * recouvre jamais le précédent, donc une écriture en base qui échoue après le
 * rangement laisse la pièce que la base désigne intacte.
 */
function proofKeyFor(companyId: string, mandateId: string, at: Date): string {
  return `companies/${companyId}/mandates/${mandateId}/mandat-signe-${at.getTime()}`;
}
