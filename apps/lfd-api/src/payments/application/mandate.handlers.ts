import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";
import type { PaymentMandateView } from "@lfd/contracts";

import { DocumentStore } from "../../infra/storage/document-store.js";
import { Clock } from "../../infra/time/clock.js";
import { ScannedDocument } from "../../shared/documents/scanned-document.js";
import { draftMandate } from "../domain/entities/payment-mandate.js";
import {
  CompanyNotFoundForMandateError,
  MandateAlreadyActiveError,
  MandateNotFoundError,
} from "../domain/errors/mandate-errors.js";
import { MandateGateway } from "../domain/mandate-gateway.js";
import { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import {
  AttachMandateProofCommand,
  RegisterMandateCommand,
  RevokeMandateCommand,
} from "./mandate-commands.js";
import { GetCompanyMandateQuery } from "./mandate-queries.js";

/**
 * Enregistre un mandat : **le prestataire d'abord, la base ensuite**.
 *
 * Cet ordre est l'invariant du handler. Écrire notre ligne avant l'appel Stripe
 * laisserait un mandat « actif » chez nous que rien n'autorise chez eux — et
 * c'est ce mandat-là qu'on croirait pouvoir prélever.
 *
 * Le mur est en amont (`AdminAuthGuard`) : le staff n'est membre d'aucune
 * société, et enregistrer un mandat est un geste commercial, jamais client.
 */
@CommandHandler(RegisterMandateCommand)
export class RegisterMandateHandler implements ICommandHandler<RegisterMandateCommand, string> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly gateway: MandateGateway,
    private readonly clock: Clock,
  ) {}

  async execute(command: RegisterMandateCommand): Promise<string> {
    const holder = await this.mandates.findHolder(command.companyId);
    if (holder === null) {
      throw new CompanyNotFoundForMandateError(command.companyId);
    }

    // Un mandat en remplace un autre par un geste explicite, jamais par
    // surprise : deux autorisations actives, et plus rien ne dit sur laquelle on
    // a prélevé. (L'index partiel tient la règle sous concurrence ; ici, on
    // rend un refus lisible plutôt qu'une violation de contrainte.)
    const current = await this.mandates.findCurrent(command.companyId);
    if (current !== null && current.debitable()) {
      throw new MandateAlreadyActiveError(command.companyId);
    }

    const now = this.clock.now();
    const acceptedAt = command.acceptedAt ?? now;
    const registration = await this.gateway.registerMandate({
      companyId: command.companyId,
      companyName: holder.companyName,
      email: holder.email,
      paymentMethodId: command.paymentMethodId,
      existingCustomerId: await this.mandates.findStripeCustomerId(command.companyId),
      acceptedAt,
    });

    return this.mandates.create(
      draftMandate({ companyId: command.companyId, registration, acceptedAt, now }),
    );
  }
}

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
    await this.gateway.revokeMandate(mandate.toSnapshot().paymentMethodId);
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
