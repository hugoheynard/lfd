import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";
import type { PaymentMandateView } from "@lfd/contracts";

import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DocumentStore } from "../../../platform/storage/document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { MandateNotFoundError } from "../domain/errors/mandate-errors.js";
import { MandateRevokedEvent } from "../domain/events/payment-mandate.events.js";
import { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import { AttachMandateProofCommand, RevokeMandateCommand } from "./mandate-commands.js";
import { GetCompanyMandateQuery } from "./mandate-queries.js";
import { attachProofToDraft } from "./mandate-proof-support.js";

/**
 * Révoque le mandat courant — actif ou brouillon — depuis la fiche.
 *
 * Une seule écriture, locale : le mandat est frappé et rangé chez nous, et
 * traité directement avec la banque. Il n'y a rien à détacher chez un
 * prestataire — le chemin Stripe qui le faisait a été supprimé le 2026-09-19,
 * aucun mandat Stripe n'existant en production (Hugo).
 *
 * Journalisé depuis le 2026-09-19 (`payment_mandate.revoked`), dans la
 * transaction de l'écriture.
 */
@CommandHandler(RevokeMandateCommand)
export class RevokeMandateHandler implements ICommandHandler<RevokeMandateCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RevokeMandateCommand): Promise<void> {
    const mandate = await this.mandates.findCurrent(command.companyId);
    if (mandate === null) {
      throw new MandateNotFoundError(command.companyId);
    }
    const previousStatus = mandate.status;
    mandate.revoke(this.clock.now());
    await this.uow.run(async () => {
      await this.mandates.save(mandate);
      await this.events.publishTraced(
        new MandateRevokedEvent(mandate.id, mandate.companyId, mandate.reference, previousStatus),
      );
    });
  }
}

/**
 * Dépose le mandat signé scanné, depuis le back-office — **sur le brouillon
 * seulement**.
 *
 * La séquence — refuser avant de ranger, clé neuve par dépôt, référence et fait
 * au journal dans la même transaction — vit dans `attachProofToDraft`, partagée
 * avec le client depuis le 2026-09-14. Pas de cloche ici : c'est l'équipe qui
 * dépose.
 *
 * `@hors-transaction` le fichier part au stockage objet avant la transaction.
 */
@CommandHandler(AttachMandateProofCommand)
export class AttachMandateProofHandler implements ICommandHandler<AttachMandateProofCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly store: DocumentStore,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AttachMandateProofCommand): Promise<void> {
    await attachProofToDraft(
      {
        mandates: this.mandates,
        store: this.store,
        cipher: this.cipher,
        clock: this.clock,
        events: this.events,
        uow: this.uow,
      },
      {
        companyId: command.companyId,
        fileName: command.fileName,
        bytes: command.bytes,
        via: "staff",
      },
    );
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
