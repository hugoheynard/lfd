import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MandateNotFoundError } from "../../domain/errors/mandate-errors.js";
import { MandateRevokedEvent } from "../../domain/events/payment-mandate.events.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { RevokeMandateCommand } from "./revoke-mandate.command.js";
import { mandateCompanyOf } from "../mandate-journal-names.js";

/**
 * Révoque le mandat courant — actif ou brouillon — depuis la fiche.
 *
 * Une seule écriture, locale : le mandat est frappé et rangé chez nous, et
 * traité directement avec la banque. Il n'y a rien à détacher chez un
 * prestataire — le chemin Stripe qui le faisait a été supprimé le 2026-09-19,
 * aucun mandat Stripe n'existant en production (Hugo).
 *
 * Journalisé (`payment_mandate.revoked`), dans la transaction de l'écriture.
 *
 * **Une fois par intention** : sujet, la société. « Le mandat courant » est
 * l'actif, sinon le brouillon : un second envoi, une fois l'actif révoqué,
 * aurait révoqué le brouillon d'une rotation bancaire. La même clé ne révoque
 * rien de plus ; l'intention est scellée avec la révocation.
 */
@CommandHandler(RevokeMandateCommand)
export class RevokeMandateHandler implements ICommandHandler<RevokeMandateCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: RevokeMandateCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: REVOKE_GESTURE,
        subject: command.companyId,
      },
      NOTHING_TO_REPLAY,
      (seal) => this.revoke(command, seal),
    );
  }

  private async revoke(command: RevokeMandateCommand, seal: () => Promise<void>): Promise<void> {
    const mandate = await this.mandates.findCurrent(command.companyId);
    if (mandate === null) {
      throw new MandateNotFoundError(command.companyId);
    }
    const previousStatus = mandate.status;
    mandate.revoke(this.clock.now());
    const company = await mandateCompanyOf(this.mandates, mandate.companyId);
    await this.uow.run(async () => {
      await this.mandates.save(mandate);
      await this.events.publishTraced(
        new MandateRevokedEvent(mandate.id, company, mandate.reference, previousStatus),
      );
      await seal();
    });
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const REVOKE_GESTURE = "payments.revoke-mandate";
