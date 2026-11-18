import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../platform/intent/intent-subject.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { ArrestedPlanHold } from "../../../production/channels/packing/index.js";
import { PackingShortfallReportedEvent } from "../../channels/commerce/index.js";
import type { PackingSheet } from "../../domain/entities/packing-sheet.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { presentLinesOf } from "../../domain/services/problem-lines.js";
import type { ShortfallLine } from "../../domain/services/shortfall.js";
import { holdArrestedPlan } from "../arrested-plan-support.js";
import { lockedSheet } from "../containers/container-support.js";
import { ProblemBag } from "./packing-problem-bag.js";
import { ReportPackingProblemCommand } from "./report-packing-problem.command.js";

/**
 * **« Problème »** — le poste dit, produit par produit, ce qui est vraiment
 * là sur une commande à retirer colisée au niveau simple (plan des niveaux de
 * suivi du colisage, D5 et D6).
 *
 * Dans une transaction, verrous dans l'ordre du poste (la fiche, puis les
 * réserves par SKU croissant) : le sac se rouvre s'il était fermé — refusé
 * si le client a retiré la commande —, il porte ensuite exactement ce qui
 * est là (un sac s'ouvre s'il n'y en a pas, jamais un bac), l'absent est mis
 * de côté, puis le manque est déclaré et `packing.shortfall_reported` part,
 * comme pour « Il manque ».
 *
 * **Une fois par intention** : la clé de l'écran est scellée dans la même
 * unité de travail ; un double clic ne signale qu'une fois.
 *
 * @sans-journal le manque est écrit par le commerce (`packing.shortfall_reported`),
 * comme pour « Il manque » ; les mouvements du sac, eux, sont journalisés.
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {ProblemOutsideSimplePickupError}
 * @throws {PackingSheetHandedOverError} @throws {ShortfallAlreadyAuthorizedError}
 * @throws {PackingLineNotFoundError} @throws {PresentBeyondDueError}
 * @throws {NothingShortError} tout ce que la commande demande est là.
 */
@CommandHandler(ReportPackingProblemCommand)
export class ReportPackingProblemHandler implements ICommandHandler<
  ReportPackingProblemCommand,
  void
> {
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

  execute(command: ReportPackingProblemCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "packing.problem",
        subject: intentSubject(command.orderId, command.serviceDay, command.present),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.report(command, seal),
    );
  }

  private async report(
    command: ReportPackingProblemCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    await this.uow.run(async () => {
      await holdArrestedPlan(this.plan, command.serviceDay);
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      sheet.assertProblemAllowed();
      const present = presentLinesOf(sheet.reference, sheet.lines, command.present);
      sheet.reopen();
      const now = this.clock.now();
      const bag = new ProblemBag(sheet, this.ids, { at: now, by: command.staffUserId });
      for (const line of present) {
        const stock = await this.stocks.lock(command.serviceDay, line.line.sku);
        bag.adjust(line, stock);
        await this.stocks.save(stock);
      }
      const lines = sheet.reportShortfall(now);
      await this.sheets.save(sheet);
      await this.events.publishTracedAll(bag.events);
      await this.publishShortfall(sheet, lines, now, command.staffUserId);
      await seal(undefined);
    });
  }

  private publishShortfall(
    sheet: PackingSheet,
    lines: readonly ShortfallLine[],
    at: Date,
    staffUserId: string,
  ): Promise<void> {
    return this.durable.publish(
      new PackingShortfallReportedEvent(
        sheet.orderId,
        sheet.rank,
        sheet.reference,
        at,
        staffUserId,
        lines.map((line) => ({ sku: line.sku, due: line.due, packed: line.packed })),
      ).durableFact(),
    );
  }
}
