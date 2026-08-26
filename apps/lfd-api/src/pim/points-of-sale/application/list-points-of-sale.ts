import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { PointOfSaleSnapshot } from "../domain/entities/point-of-sale.js";
import { PointOfSaleRepository } from "../domain/ports/point-of-sale.repository.js";
import { PointOfSaleUsageReader } from "../domain/ports/point-of-sale-usage.reader.js";
import { isRootPointOfSale } from "../domain/value-objects/bootstrap-point-of-sale.js";

/** Un point de vente tel que la liste le rend : son état, plus ce que l'écran doit savoir. */
export type PointOfSaleListItem = PointOfSaleSnapshot & {
  /** Combien de familles y vendent. Zéro ⇒ supprimable. */
  readonly usedByCategories: number;
  /** La racine ne se supprime pas — l'écran doit le DIRE, pas l'apprendre au clic. */
  readonly root: boolean;
};

/** Lecture des points de vente — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListPointsOfSaleQuery {}

@QueryHandler(ListPointsOfSaleQuery)
export class ListPointsOfSaleHandler implements IQueryHandler<
  ListPointsOfSaleQuery,
  PointOfSaleListItem[]
> {
  constructor(
    private readonly points: PointOfSaleRepository,
    private readonly usage: PointOfSaleUsageReader,
  ) {}

  /**
   * La lecture rend des **instantanés**, pas des agrégats : un lecteur n'a
   * aucune raison de pouvoir muter ce qu'il affiche.
   *
   * Le compte d'usages voyage avec. Il ne vit PAS dans l'agrégat — un point de
   * vente ignore les familles qui le vendent — mais l'écran en a besoin pour
   * DIRE qu'une suppression échouera, au lieu de l'apprendre après le clic.
   *
   * Une seule lecture des comptes pour toute la liste, jamais une par ligne.
   */
  async execute(): Promise<PointOfSaleListItem[]> {
    const [points, counts] = await Promise.all([
      this.points.listAll(),
      this.usage.countByPointOfSale(),
    ]);
    return points.map((point) => {
      const snapshot = point.snapshot();
      return {
        ...snapshot,
        usedByCategories: counts.get(snapshot.id) ?? 0,
        root: isRootPointOfSale(snapshot.id),
      };
    });
  }
}
