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
import { BasketLine } from "../../../basket/domain/value-objects/basket-line.js";
import { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import { BasketArticles } from "../../../channels/commerce/basket-articles.js";
import { RECURRING_BASKET_OCCURRENCE_CHANGED } from "../../../channels/commerce/basket-facts.js";
import type { Occurrence } from "../../domain/entities/occurrence.js";
import {
  OccurrenceChangedMeanwhileError,
  OccurrenceNotPlannedError,
} from "../../domain/errors/occurrence-errors.js";
import { OccurrenceRepository } from "../../domain/ports/occurrence.repository.js";
import { OverrideOccurrenceCommand } from "./override-occurrence.command.js";

/**
 * **Déroge à une échéance** : la sauter, ou remplacer ses lignes — sur sa
 * ligne, que l'entité garde dans son cycle (on ne saute pas une échéance déjà
 * passée). Les articles passent les mêmes gardes qu'à l'ouverture : une
 * échéance dérogée ne commande pas ce que le panier n'aurait pas pu commander.
 *
 * **Rien à faire** quand la dérogation demandée est celle déjà posée (saut,
 * lignes et note) : ni écriture, ni fait — un rejeu ne journalise pas un
 * changement qui n'a pas eu lieu.
 */
@CommandHandler(OverrideOccurrenceCommand)
export class OverrideOccurrenceHandler implements ICommandHandler<OverrideOccurrenceCommand, void> {
  constructor(
    private readonly occurrences: OccurrenceRepository,
    private readonly gestures: BasketGestures,
    private readonly facts: BasketFacts,
    private readonly articles: BasketArticles,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {OccurrenceNotPlannedError} le jour n'a pas d'échéance prévue.
   * @throws {OccurrenceTransitionRefusedError} l'échéance n'admet pas ce geste.
   * @throws {OccurrenceChangedMeanwhileError} le balayage l'a passée pendant le geste.
   */
  async execute(command: OverrideOccurrenceCommand): Promise<void> {
    const basket = await this.gestures.loadManaged(command.basketId, command.actorUserId);
    const { payload } = command;
    const skus = payload.skipped ? [] : payload.lines.map((line) => line.sku);
    await this.articles.ensureOpenTo(basket.companyId, skus);
    const review = await this.articles.review(skus);
    const date = IsoDate.fromString(command.date);
    const occurrence = await this.occurrences.load(basket.id, date);
    if (occurrence === null) {
      throw new OccurrenceNotPlannedError(date.toString());
    }
    const lines = payload.skipped
      ? []
      : payload.lines.map((line) =>
          BasketLine.requested(
            line.sku,
            line.quantity,
            review.weightSold.has(line.sku) ? "weight" : "piece",
          ),
        );
    const before = overrideOf(occurrence);
    const after: OccurrenceOverride = { skipped: payload.skipped, lines: plain(lines) };
    if (sameOverride(before, after) && occurrence.snapshot.note === payload.note) {
      return;
    }
    const at = this.clock.now();
    if (payload.skipped) {
      occurrence.skip(payload.note, at);
    } else {
      occurrence.override(lines, payload.note, at);
    }
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

/** La dérogation que porte une échéance, `null` sans dérogation. */
function overrideOf(occurrence: Occurrence): OccurrenceOverride | null {
  const { state, lines } = occurrence.snapshot;
  if (state === "skipped") {
    return { skipped: true, lines: [] };
  }
  return lines === null ? null : { skipped: false, lines: plain(lines) };
}

function plain(lines: readonly BasketLine[]): OccurrenceOverride["lines"] {
  return lines.map((line) => ({ sku: line.sku, quantity: line.quantity }));
}

function sameOverride(before: OccurrenceOverride | null, after: OccurrenceOverride): boolean {
  return (
    before !== null &&
    before.skipped === after.skipped &&
    before.lines.length === after.lines.length &&
    before.lines.every(
      (line, index) =>
        line.sku === after.lines[index]?.sku && line.quantity === after.lines[index]?.quantity,
    )
  );
}
