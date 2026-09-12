import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";
import type { PaymentMandateView } from "@lfd/contracts";

import { DocumentStore } from "../../../platform/storage/document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { ScannedDocument } from "../../../platform/shared/documents/scanned-document.js";
import { MandateNotFoundError } from "../domain/errors/mandate-errors.js";
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
 * Dépose le mandat signé scanné.
 *
 * Ranger d'abord, écrire la référence ensuite : si le stockage échoue, la base
 * ne pointe pas vers une pièce absente — et un mandat qu'on croit prouvé sans
 * l'être est pire qu'un mandat qu'on sait nu.
 */
@CommandHandler(AttachMandateProofCommand)
export class AttachMandateProofHandler implements ICommandHandler<AttachMandateProofCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly store: DocumentStore,
  ) {}

  async execute(command: AttachMandateProofCommand): Promise<void> {
    const mandate = await this.mandates.findCurrent(command.companyId);
    if (mandate === null) {
      throw new MandateNotFoundError(command.companyId);
    }
    const document = ScannedDocument.create(command.fileName, command.bytes);
    const storageKey = await this.store.save(proofKeyFor(command.companyId, mandate.id), {
      bytes: document.bytes,
      contentType: document.contentType,
    });
    mandate.attachProof({ storageKey, fileName: document.fileName });
    await this.mandates.save(mandate);
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
 * Clé de stockage du mandat signé — ancrée sur la société **et** sur le mandat :
 * un mandat remplacé garde sa preuve, sinon l'historique qu'on tient tant à
 * conserver perdrait la seule pièce qui le justifie.
 */
function proofKeyFor(companyId: string, mandateId: string): string {
  return `companies/${companyId}/mandates/${mandateId}/mandat-signe`;
}
