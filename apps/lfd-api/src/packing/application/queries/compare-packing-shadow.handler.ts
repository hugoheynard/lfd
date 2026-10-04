import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { LegacyPackingReader } from "../../../production/channels/packing/index.js";
import { PackingShadowReader } from "../../domain/ports/packing-shadow.reader.js";
import { packableLines } from "../../domain/services/packable.js";
import { compareShadow } from "../../domain/services/shadow-comparison.js";
import {
  ComparePackingShadowQuery,
  type ComparedStock,
  type PackingShadowComparison,
} from "./compare-packing-shadow.query.js";

/**
 * **La répétition, mesurée** — le colisable de l'ombre face à celui du poste
 * réel, ligne à ligne (plan `colisage/plan-domaine-colisage.md`, K1 ; §13 :
 * le colisable seulement, pas les bacs faits).
 *
 * Les deux côtés passent par la MÊME fonction d'attribution (`packableLines`) :
 * un écart est un écart de DONNÉES — une remise perdue, une commande pas
 * arrivée, une échéance différente —, jamais celui de deux règles.
 *
 * Côté fournil, le stock est « sorti du four » ; côté ombre, « reçu − rendu ».
 * Sur une journée ordinaire d'après K1, les deux coïncident. Une fournée
 * déclarée avant le déploiement n'a pas été remise : l'écart est alors attendu,
 * et c'est la colonne des stocks qui le montre.
 */
@QueryHandler(ComparePackingShadowQuery)
export class ComparePackingShadowHandler implements IQueryHandler<
  ComparePackingShadowQuery,
  PackingShadowComparison
> {
  constructor(
    private readonly shadow: PackingShadowReader,
    private readonly legacy: LegacyPackingReader,
  ) {}

  async execute(query: ComparePackingShadowQuery): Promise<PackingShadowComparison> {
    const [legacyDay, shadowDay] = await Promise.all([
      this.legacy.dayOf(query.serviceDay),
      this.shadow.dayOf(query.serviceDay),
    ]);
    const legacyStock = new Map(legacyDay.produced.map((item) => [item.sku, item.quantity]));
    const shadowStock = new Map(
      shadowDay.stocks.map((stock) => [stock.sku, stock.received - stock.returned]),
    );
    const comparison = compareShadow(
      packableLines(legacyDay.orders, legacyStock),
      packableLines(shadowDay.orders, shadowStock),
    );
    return {
      serviceDay: query.serviceDay,
      gaps: comparison.gaps,
      lines: comparison.lines,
      stocks: stocksOf(legacyStock, shadowStock),
    };
  }
}

function stocksOf(
  legacy: ReadonlyMap<string, number>,
  shadow: ReadonlyMap<string, number>,
): readonly ComparedStock[] {
  return [...new Set([...legacy.keys(), ...shadow.keys()])]
    .sort()
    .map((sku) => ({ sku, legacy: legacy.get(sku) ?? 0, shadow: shadow.get(sku) ?? 0 }));
}
