import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../platform/intent/intent-subject.js";
import { ArrestedPlanHold } from "../../../production/channels/packing/index.js";
import { PackingLineNotFoundError } from "../../domain/errors/packing-station-errors.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { holdArrestedPlan } from "../arrested-plan-support.js";
import { lockedSheet } from "../containers/container-support.js";
import { RecoverMissingPiecesCommand } from "./recover-missing-pieces.command.js";

/**
 * **« Pièces retrouvées »** — le manager rend au libre de la réserve du jour
 * des pièces mises de côté comme absentes par « Problème » (plan des niveaux
 * de suivi du colisage, D6), depuis la commande qui les avait dites absentes.
 *
 * Verrous dans l'ordre du poste : la fiche (elle situe la journée et nomme
 * les articles), puis les réserves par SKU croissant. Chaque réserve refuse
 * de rendre plus qu'elle n'a mis de côté ; le sac de la commande ne bouge
 * pas — c'est le poste qui y remet les pièces, s'il le faut.
 *
 * **Une fois par intention** : un double clic ne rend qu'une fois.
 *
 * @sans-journal le journal n'a pas de type pour le manquant de la réserve ;
 * on ne l'invente pas ici.
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {PackingLineNotFoundError}
 * @throws {RecoveredBeyondMissingError} plus que les pièces mises de côté.
 */
@CommandHandler(RecoverMissingPiecesCommand)
export class RecoverMissingPiecesHandler implements ICommandHandler<
  RecoverMissingPiecesCommand,
  void
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly stocks: PackingStockRepository,
    private readonly uow: UnitOfWork,
    private readonly plan: ArrestedPlanHold,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: RecoverMissingPiecesCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "packing.found",
        subject: intentSubject(command.orderId, command.serviceDay, command.found),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.recover(command, seal),
    );
  }

  private async recover(
    command: RecoverMissingPiecesCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    await this.uow.run(async () => {
      await holdArrestedPlan(this.plan, command.serviceDay);
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      const found = [...command.found].sort((a, b) => a.sku.localeCompare(b.sku));
      for (const { sku, quantity } of found) {
        const line = sheet.lines.find((candidate) => candidate.sku === sku);
        if (line === undefined) {
          throw new PackingLineNotFoundError(sku, sheet.reference);
        }
        const stock = await this.stocks.lock(command.serviceDay, sku);
        stock.recover(quantity, line.productName, line.saleUnit);
        await this.stocks.save(stock);
      }
      await seal(undefined);
    });
  }
}
