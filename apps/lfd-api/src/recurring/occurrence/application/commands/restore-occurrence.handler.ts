import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BasketFacts } from "../../../basket/application/services/basket-facts.js";
import { BasketGestures } from "../../../basket/application/services/basket-gestures.js";
import {
  type OccurrenceOverride,
  SubscriptionOccurrenceOverriddenEvent,
} from "../../../basket/domain/events/basket-acts.events.js";
import { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import { RECURRING_BASKET_OCCURRENCE_CHANGED } from "../../../channels/commerce/basket-facts.js";
import {
  OccurrenceChangedMeanwhileError,
  OccurrenceNotPlannedError,
} from "../../domain/errors/occurrence-errors.js";
import { OccurrenceRepository } from "../../domain/ports/occurrence.repository.js";
import { RestoreOccurrenceCommand } from "./restore-occurrence.command.js";

/**
 * **Rétablit une échéance** : l'entité la ramène au gabarit, et refuse si
 * elle est déjà passée, manquée ou annulée. Le journal la lit comme une
 * dérogation dont l'après est le gabarit ; le fait
 * `recurring.basket_occurrence_changed` part dans la même transaction.
 *
 * **Rien à faire** quand l'échéance est déjà au gabarit : ni écriture, ni
 * fait — un rejeu ne journalise pas un changement qui n'a pas eu lieu.
 */
@CommandHandler(RestoreOccurrenceCommand)
export class RestoreOccurrenceHandler implements ICommandHandler<RestoreOccurrenceCommand, void> {
  constructor(
    private readonly occurrences: OccurrenceRepository,
    private readonly gestures: BasketGestures,
    private readonly facts: BasketFacts,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {OccurrenceNotPlannedError} le jour n'a pas d'échéance prévue.
   * @throws {OccurrenceTransitionRefusedError} l'échéance n'admet plus ce geste.
   * @throws {OccurrenceChangedMeanwhileError} le balayage l'a passée pendant le geste.
   */
  async execute(command: RestoreOccurrenceCommand): Promise<void> {
    const basket = await this.gestures.loadManaged(command.basketId, command.actorUserId);
    const date = IsoDate.fromString(command.date);
    const occurrence = await this.occurrences.load(basket.id, date);
    if (occurrence === null) {
      throw new OccurrenceNotPlannedError(date.toString());
    }
    const before = overrideOf(occurrence.snapshot);
    if (!occurrence.restore(this.clock.now())) {
      return;
    }
    const after: OccurrenceOverride = {
      skipped: false,
      lines: basket.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    };
    await this.uow.run(async () => {
      if (!(await this.occurrences.save(occurrence))) {
        throw new OccurrenceChangedMeanwhileError(date.toString());
      }
      await this.events.publishTraced(
        new SubscriptionOccurrenceOverriddenEvent(basket.id, date.toString(), before, after),
      );
      await this.facts.publish(RECURRING_BASKET_OCCURRENCE_CHANGED, basket);
    });
  }
}

/** La dérogation que porte une échéance avant le geste, `null` sans dérogation. */
function overrideOf(snapshot: {
  readonly state: string;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[] | null;
}): OccurrenceOverride | null {
  if (snapshot.state === "skipped") {
    return { skipped: true, lines: [] };
  }
  return snapshot.lines === null
    ? null
    : { skipped: false, lines: snapshot.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })) };
}
