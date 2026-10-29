import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SaleSkuAliasReader } from "../../catalog/domain/ports/sale-sku-alias.reader.js";
import type { AlertEvaluationContext } from "../domain/detectors/context.js";
import {
  AccountOrderHistoryReader,
  ProductNormReader,
  type AccountOrderHistory,
  type EvaluatedOrderBound,
} from "../domain/ports/order-history.reader.js";
import { everOrderedAmong, historyByAskedSku } from "./article-history.js";

/**
 * Les statuts qui **comptent** dans l'historique.
 *
 * `cancelled` en est exclu : une commande annulée n'a jamais été un achat, et la
 * compter ferait baisser une moyenne sans qu'aucun volume n'ait bougé. Les
 * commandes issues d'un abonnement, elles, sont dedans — c'est du volume réel, et
 * à LFC c'est même le volume principal.
 */
// Plan E7 reliquat (L5a) : en partie retirée, la commande reste un achat.
const COUNTED_STATUSES = [
  "placed",
  "confirmed",
  "in_production",
  // Décision de Hugo du 2026-10-26 : « prête » compte — elle comptait la veille en `confirmed`.
  "ready",
  "partially_handed_over",
  "fulfilled",
] as const;

/**
 * L'historique d'un compte, en **trois** requêtes quelle que soit la taille du
 * panier — jamais une par ligne (plus la lecture des alias).
 *
 * Par ARTICLE : une ancienne référence (`PAI-001`) et sa cible (`PAI-001-1`)
 * sont un seul historique (`plan-defaut-sous-sa-reference.md`, § 2 a). La
 * requête cherche toutes les graphies, le pli se fait sur la référence
 * canonique, et la clé rendue reste celle que le panier porte.
 */
@Injectable()
export class PrismaAccountOrderHistoryReader extends AccountOrderHistoryReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasReader: SaleSkuAliasReader,
  ) {
    super();
  }

  async read(input: {
    readonly companyId: string;
    readonly evaluatedOrder: EvaluatedOrderBound | null;
    readonly skus: readonly string[];
    readonly windowDays: number;
    readonly maxOrdersPerSku: number;
    readonly now: Date;
  }): Promise<AccountOrderHistory> {
    const since = new Date(input.now.getTime() - input.windowDays * DAY_MS);
    const aliases = await this.aliasReader.around(input.skus);
    const spellings = [...aliases.spellingsOfAll(input.skus)];
    const walled = {
      companyId: input.companyId,
      status: { in: [...COUNTED_STATUSES] },
      // Les commandes d'AVANT celle qu'on évalue, et non « toutes sauf elle » :
      // une commande passée pendant que l'évaluation attendait sur le bus n'est
      // pas son historique. À instant égal, les autres commandes comptent (cf.
      // `before`). Rien à borner lors d'un contrôle de panier : rien n'est écrit.
      ...(input.evaluatedOrder === null ? {} : before(input.evaluatedOrder)),
    };

    const [recent, ever, previousOrderCount] = await Promise.all([
      // Les lignes récentes, triées : le découpage par SKU se fait en mémoire,
      // ce qui évite une requête par produit.
      this.prisma.orderLine.findMany({
        where: { sku: { in: spellings }, order: { ...walled, createdAt: { gte: since } } },
        select: { sku: true, quantity: true, order: { select: { createdAt: true } } },
        orderBy: { order: { createdAt: "desc" } },
      }),
      // « Jamais commandé » ignore la fenêtre : un produit pris il y a trois ans
      // n'est pas un nouveau produit.
      this.prisma.orderLine.findMany({
        where: { sku: { in: spellings }, order: walled },
        select: { sku: true },
        distinct: ["sku"],
      }),
      this.prisma.order.count({ where: walled }),
    ]);

    return {
      history: historyByAskedSku(recent, input.skus, aliases, input.maxOrdersPerSku),
      everOrdered: everOrderedAmong(ever, input.skus, aliases),
      previousOrderCount,
    };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * La norme catalogue, lue depuis la projection — jamais agrégée à la volée.
 * La projection est rangée par article (`PrismaProductNormStore.compute`) :
 * on la lit sous la référence canonique, et on la rend sous celle du panier.
 */
@Injectable()
export class PrismaProductNormReader extends ProductNormReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasReader: SaleSkuAliasReader,
  ) {
    super();
  }

  async read(skus: readonly string[]): Promise<AlertEvaluationContext["norms"]> {
    const aliases = await this.aliasReader.around(skus);
    const articles = [...new Set(skus.map((sku) => aliases.canonical(sku)))];
    const rows = await this.prisma.productNorm.findMany({ where: { sku: { in: articles } } });
    const byArticle = new Map(
      rows.map((row) => [
        row.sku,
        { medianQuantity: Number(row.medianQuantity), sampleLines: row.sampleLines },
      ]),
    );
    return new Map(
      skus.flatMap((sku) => {
        const norm = byArticle.get(aliases.canonical(sku));
        return norm === undefined ? [] : [[sku, norm] as const];
      }),
    );
  }
}

/**
 * Les commandes passées avant `order`, et celles du **même instant**, sauf
 * elle-même.
 *
 * À instant égal, les autres comptent — comme sous la règle d'avant. Les
 * départager par l'identifiant (aléatoire) rendait l'historique instable : la
 * graine de démo pose plusieurs commandes au même instant exact, et le nombre
 * d'alertes changeait d'un rechargement à l'autre (`dev-scenario-stability`,
 * constaté le 2026-10-10). La course fermée ici n'en dépend pas : une commande
 * passée pendant que l'évaluation attendait porte un instant plus tardif.
 */
function before(order: EvaluatedOrderBound): {
  OR: ({ createdAt: { lt: Date } } | { createdAt: Date; id: { not: string } })[];
} {
  return {
    OR: [
      { createdAt: { lt: order.placedAt } },
      { createdAt: order.placedAt, id: { not: order.id } },
    ],
  };
}
