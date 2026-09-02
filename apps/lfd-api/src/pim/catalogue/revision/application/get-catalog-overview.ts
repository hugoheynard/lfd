import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { CatalogOverviewView } from "@lfd/pim-contracts";

import { AccountingRulesRepository } from "../../../accounting-rules/domain/ports/accounting-rules.repository.js";
import { planDiff } from "../domain/diff.js";
import { CatalogRevisionRepository } from "../domain/ports/catalog-revision.repository.js";
import { CatalogRevisionSource } from "../domain/ports/catalog-revision.source.js";
import { buildRevision } from "../domain/revision.js";
import { summaryOf } from "./diff-catalog-revisions.js";

export class GetCatalogOverviewQuery {}

/**
 * **Où en est le catalogue.**
 *
 * Il se calcule comme une capture qu'on ne poserait pas : on construit la
 * révision du catalogue tel qu'il est, et on la compare à la dernière ancre
 * **publiée**. C'est ce qui permet de répondre « 3 articles ont changé depuis la
 * 12 » sans écrire une ligne — et de le répondre avec EXACTEMENT la même
 * mécanique que la pose, donc sans qu'un écran puisse annoncer un changement que
 * la capture ignorerait.
 *
 * 🔴 **Publiée, pas posée.** La référence était `latest()`, la dernière ancre
 * POSÉE — et l'écart se voyait sur le cas le plus banal : un catalogue qui va de
 * A à B puis revient à A se comparait à B et annonçait N changements sur un
 * catalogue qu'on venait de republier entier.
 *
 * Conséquence assumée : un catalogue qu'on n'a jamais fait que **simuler** n'a
 * pas de référence, et l'écran n'en affiche aucune. C'est exact — rien n'est
 * parti, il n'y a rien à quoi se comparer.
 */
@QueryHandler(GetCatalogOverviewQuery)
export class GetCatalogOverviewHandler implements IQueryHandler<
  GetCatalogOverviewQuery,
  CatalogOverviewView
> {
  constructor(
    private readonly source: CatalogRevisionSource,
    private readonly revisions: CatalogRevisionRepository,
    private readonly accounting: AccountingRulesRepository,
  ) {}

  async execute(): Promise<CatalogOverviewView> {
    const [items, rules, latest] = await Promise.all([
      this.source.snapshotItems(),
      this.accounting.read(),
      this.revisions.lastPublished(),
    ]);
    const current = buildRevision(
      { proRatioBp: rules?.rules.proPriceRatio.basisPoints ?? null },
      items,
    );

    // Par FICHE et non par article : un produit à trois déclinaisons est un
    // produit. Compter les articles ici gonflerait les statuts d'un facteur qui
    // dépend du conditionnement.
    const products = new Map(items.map((item) => [item.productId, item]));
    const published = [...products.values()].filter((item) => item.status === "published").length;
    const signed = [...products.values()].filter((item) => item.readyBy !== null).length;

    return {
      products: products.size,
      published,
      drafts: products.size - published,
      signed,
      articles: items.length,
      lastRevision: latest === null ? null : summaryOf(latest),
      sinceLastRevision:
        latest === null
          ? null
          : countChanges(
              planDiff(await this.revisions.indexOf(latest.id), {
                hashBySku: new Map(current.items.map((item) => [item.sku, item.hash])),
                proRatioBp: current.header.proRatioBp,
              }),
            ),
    };
  }
}

function countChanges(plan: {
  added: readonly string[];
  removed: readonly string[];
  changed: readonly string[];
}): { added: number; removed: number; changed: number } {
  return { added: plan.added.length, removed: plan.removed.length, changed: plan.changed.length };
}
