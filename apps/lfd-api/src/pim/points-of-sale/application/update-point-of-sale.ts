import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import type { PointOfSale } from "../domain/entities/point-of-sale.js";
import { changesBetween } from "../../journal/changes.js";
import { PointOfSaleRepository } from "../domain/ports/point-of-sale.repository.js";
import { PointOfSaleUsageReader } from "../domain/ports/point-of-sale-usage.reader.js";
import { ContextStillSoldHereError } from "../domain/errors/points-of-sale-errors.js";
import { requirePointOfSale } from "./point-of-sale-support.js";

export interface UpdatePointOfSalePatch {
  readonly label?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly contexts?: readonly string[] | undefined;
  readonly tableCount?: number | undefined;
}

export class UpdatePointOfSaleCommand {
  constructor(
    readonly id: string,
    readonly patch: UpdatePointOfSalePatch,
  ) {}
}

/**
 * Applique un patch partiel sur l'agrégat, puis l'enregistre **en une fois**.
 *
 * L'ordre n'a plus d'importance entre l'offre et la grille : régler l'offre ne
 * touche pas aux tables. C'était le cas avant — fermer la salle vidait la
 * grille — et il fallait donc appliquer les champs dans un ordre précis. Une
 * grille de tables est de l'équipement, pas un mode de vente.
 */
@CommandHandler(UpdatePointOfSaleCommand)
export class UpdatePointOfSaleHandler implements ICommandHandler<UpdatePointOfSaleCommand, void> {
  constructor(
    private readonly points: PointOfSaleRepository,
    private readonly usage: PointOfSaleUsageReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * **On ne cesse pas d'offrir un contexte qu'on y vend encore.**
   *
   * Aucune clé étrangère ne tient cette règle : l'offre et la matrice sont deux
   * tables sans lien direct. Le refus est donc une lecture — et il faut le
   * dire, parce que sans lui la ligne de matrice survivait à l'offre, la
   * projection fabriquait une fiche pour un lieu qui ne sert pas, et l'écran ne
   * rendait plus la case qui aurait permis de la décocher.
   *
   * Seuls les contextes RETIRÉS sont examinés : en ajouter un n'a jamais posé
   * de problème.
   */
  private async refuseWithdrawingWhatIsSold(
    id: string,
    before: readonly string[],
    after: readonly string[],
  ): Promise<void> {
    const withdrawn = before.filter((key) => !after.includes(key));
    if (withdrawn.length === 0) {
      return;
    }
    const sold = await this.usage.countSoldByContext(id);
    for (const key of withdrawn) {
      const sellers = sold.get(key) ?? 0;
      if (sellers > 0) {
        throw new ContextStillSoldHereError(key, sellers);
      }
    }
  }

  async execute(command: UpdatePointOfSaleCommand): Promise<void> {
    const { id, patch } = command;
    const pointOfSale = await requirePointOfSale(this.points, id);
    const before = traced(pointOfSale);

    if (patch.label !== undefined) {
      pointOfSale.rename(patch.label);
    }
    if (patch.baseUrl !== undefined) {
      pointOfSale.setBaseUrl(patch.baseUrl);
    }
    if (patch.contexts !== undefined) {
      await this.refuseWithdrawingWhatIsSold(id, pointOfSale.snapshot().contexts, patch.contexts);
      pointOfSale.setOfferedContexts(patch.contexts);
    }
    if (patch.tableCount !== undefined) {
      pointOfSale.setTableCount(patch.tableCount);
    }

    const changes = changesBetween(before, traced(pointOfSale));
    await this.uow.run(async () => {
      // L'écran renvoie la fiche entière à chaque enregistrement : sans ce
      // filtre, l'historique serait surtout composé de gestes qui n'ont rien
      // changé.
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.pointOfSaleUpdated,
              subjectType: "point_of_sale",
              subjectId: id,
              payload: { changes },
            })
          : this.journal.untraced("point de vente enregistré sans modification");
      await this.points.save(pointOfSale, ticket);
    });
  }
}

/**
 * Ce que le journal retient : les réglages, et le NOMBRE de tables plutôt que
 * la grille.
 *
 * Les tables portent les jetons de QR — les verser dans une charge utile
 * mettrait des accès de commande à table dans un flux qu'on relit à l'écran. Et
 * un « avant → après » de vingt lignes enterrerait le seul changement qu'on
 * cherchait.
 */
function traced(pointOfSale: PointOfSale): Record<string, unknown> {
  const { label, baseUrl, contexts, tables } = pointOfSale.snapshot();
  return { label, baseUrl, contexts: [...contexts].join(" "), tableCount: tables.length };
}
