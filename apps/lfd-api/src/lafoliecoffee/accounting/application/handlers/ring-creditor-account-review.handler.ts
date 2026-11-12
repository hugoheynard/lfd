import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { staffPermission } from "@lfd/contracts";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  CreditorAccountConfirmedEvent,
  CreditorAccountProposalCancelledEvent,
  CreditorAccountProposedEvent,
  type CreditorAccountReviewEvent,
} from "../../domain/events/creditor-account-review.events.js";

const RING_CREDITOR_ACCOUNT_REVIEW = "ring-creditor-account-review";

/**
 * **La cloche de la comptabilité** sur le compte de l'entité aux quatre yeux :
 * proposé, confirmé, annulé (`le-paiement-par-virement.md`,
 * T0). Changer le compte qui reçoit l'argent est la cible de la fraude au
 * faux RIB : toute la comptabilité le voit passer, pas seulement les deux qui
 * l'ont fait.
 *
 * Adressée par droit (`b2b_accounting` en lecture). Chaque fait rédige sa
 * notice (`bell()`) : pas de branche ici. Une clé par fait et par saisie —
 * rejouée, elle ne sonne pas deux fois. Sonnée après la validation : un geste
 * annulé ne sonne pas.
 */
@EventsHandler(
  CreditorAccountProposedEvent,
  CreditorAccountConfirmedEvent,
  CreditorAccountProposalCancelledEvent,
)
export class RingCreditorAccountReview implements IEventHandler<CreditorAccountReviewEvent> {
  private readonly logger = new Logger(RingCreditorAccountReview.name);

  constructor(
    private readonly notifier: StaffNotifier,
    private readonly work: BackgroundWork,
    private readonly afterCommit: AfterCommit,
  ) {}

  handle(event: CreditorAccountReviewEvent): void {
    this.afterCommit.defer(
      () => this.work.track(this.run(event), RING_CREDITOR_ACCOUNT_REVIEW),
      RING_CREDITOR_ACCOUNT_REVIEW,
    );
  }

  private async run(event: CreditorAccountReviewEvent): Promise<void> {
    const bell = event.bell();
    try {
      await this.notifier.notify([
        {
          kind: bell.kind,
          subject: bell.subject,
          body: bell.body,
          link: `/comptabilite/entites-juridiques/${event.entity.id}`,
          idempotencyKey: `notification:${bell.kind}:${event.pending.id}`,
          occurredAt: event.at,
          audience: staffPermission("b2b_accounting", "read"),
        },
      ]);
    } catch (error) {
      this.logger.error(
        `Cloche du compte bancaire non émise (${bell.kind}, saisie ${event.pending.id})`,
        error,
      );
    }
  }
}
