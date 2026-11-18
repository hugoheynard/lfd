import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../platform/intent/intent-subject.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { ArrestedPlanHold } from "../../../production/channels/packing/index.js";
import type { PackingSheet, SheetMark } from "../../domain/entities/packing-sheet.js";
import type { PackingStock } from "../../domain/entities/packing-stock.js";
import { AllReadyNotArrivedError } from "../../domain/errors/packing-all-ready-errors.js";
import { ShortfallAwaitingDecisionError } from "../../domain/errors/packing-shortfall-errors.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { allReadyShortages } from "../../domain/services/all-ready.js";
import { holdArrestedPlan } from "../arrested-plan-support.js";
import { lockedSheet } from "../containers/container-support.js";
import { DeclareAllReadyCommand } from "./declare-all-ready.command.js";
import { ProblemBag } from "./packing-problem-bag.js";
import { publishSealedOrder } from "./sealed-order-facts.js";

/**
 * **« Tout est prêt »** — le poste déclare prête, d'un geste, une commande à
 * retirer colisée au niveau simple (plan des niveaux de suivi du colisage, D4).
 *
 * Dans une transaction, verrous dans l'ordre du poste (la garde du plan
 * arrêté, la fiche, puis les réserves par SKU croissant) : un sac s'ouvre
 * s'il n'y a aucun contenant vivant (jamais un bac), chaque ligne y est
 * mise entière par la réserve (`take`), la fiche se ferme (`seal`) et
 * `packing.order_packed` part, comme pour « Déclarer prête » — avec
 * `packing.shortfall_cleared` si un manque signalé est ainsi comblé.
 *
 * **Refusé, rien n'est écrit**, si la réserve libre ne couvre pas ce qui
 * reste : le refus nomme chaque produit et ce qu'il en manque. Un manque déjà
 * signalé et pas encore décidé refuse de son côté, avec ses mots.
 *
 * Une fiche déjà fermée se réannonce, comme « Déclarer prête » rejouée ; la
 * même clé d'intention, elle, ne refait rien.
 *
 * @sans-journal comme `ClosePackingOrderHandler` : `order.ready` est écrit
 * par l'abonné du commerce ; les mouvements du sac, eux, sont journalisés.
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {AllReadyOutsideSimplePickupError}
 * @throws {ShortfallAwaitingDecisionError} @throws {AllReadyNotArrivedError}
 */
@CommandHandler(DeclareAllReadyCommand)
export class DeclareAllReadyHandler implements ICommandHandler<DeclareAllReadyCommand, void> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly stocks: PackingStockRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
    private readonly plan: ArrestedPlanHold,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: DeclareAllReadyCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "packing.all_ready",
        subject: intentSubject(command.orderId, command.serviceDay),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.declare(command, seal),
    );
  }

  private async declare(
    command: DeclareAllReadyCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    await this.uow.run(async () => {
      await holdArrestedPlan(this.plan, command.serviceDay);
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      sheet.assertAllReadyAllowed();
      const now = this.clock.now();
      const mark = { at: now, by: command.staffUserId };
      const signalled = sheet.shortfallReportedAt !== null;
      if (sheet.packed === null) {
        await this.fill(command.serviceDay, sheet, mark);
      }
      const sealed = sheet.seal(mark);
      if (sealed.fresh) {
        await this.sheets.save(sheet);
      }
      await publishSealedOrder(this.durable, sheet, sealed, signalled, now);
      await seal(undefined);
    });
  }

  /** Verrouille les réserves, vérifie qu'elles couvrent tout, puis remplit le sac. */
  private async fill(serviceDay: string, sheet: PackingSheet, mark: SheetMark): Promise<void> {
    const lines = [...sheet.lines].sort((a, b) => a.sku.localeCompare(b.sku));
    const stocks = new Map<string, PackingStock>();
    for (const line of lines) {
      stocks.set(line.sku, await this.stocks.lock(serviceDay, line.sku));
    }
    const bag = new ProblemBag(sheet, this.ids, mark);
    const shortages = allReadyShortages(
      lines,
      (line) => bag.heldOf(line.sku),
      (sku) => stocks.get(sku)?.free ?? 0,
    );
    if (shortages.length > 0) {
      throw sheet.shortfallReportedAt !== null && sheet.shortfallAuthorizedAt === null
        ? new ShortfallAwaitingDecisionError(sheet.reference)
        : new AllReadyNotArrivedError(sheet.reference, shortages);
    }
    for (const line of lines) {
      const stock = stocks.get(line.sku);
      if (stock !== undefined) {
        bag.fill(line, stock);
        await this.stocks.save(stock);
      }
    }
    await this.events.publishTracedAll(bag.events);
  }
}
