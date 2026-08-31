import { Injectable } from "@nestjs/common";
import type { PricingBoardView, PricingCategoryView, PricingItemView } from "@lfd/contracts";

import { rollingWindows, windowsAroundChange } from "../domain/elasticity-windows.js";
import { SkuVolumeReader, type VolumeWindow } from "../domain/ports/sku-volume.reader.js";
import type { WindowPair } from "../domain/elasticity-windows.js";
import { itemElasticity, type MeasuredPair } from "./elasticity-report.js";

/** Les volumes d'une paire de fenêtres, pour tous les SKU d'un coup. */
interface MeasuredWindows {
  readonly windows: WindowPair;
  readonly baseline: ReadonlyMap<string, number>;
  readonly observed: ReadonlyMap<string, number>;
}

/**
 * **Le rapport prix / volume, ajouté au tableau de tarification.**
 *
 * Séparé du lecteur du tableau parce qu'il fait autre chose : celui-là résout
 * des prix, celui-ci mesure des ventes. Les mélanger aurait donné un fichier qui
 * change pour deux raisons — et c'est le second métier, l'analyse, qui bougera
 * le plus.
 *
 * **Le coût est borné, et c'est le point délicat.** Une mesure par article
 * ferait quatre-vingt-douze paires de requêtes. Ici : deux pour la fenêtre
 * glissante, plus deux par **date de changement distincte** — et il y a autant
 * de dates que de règles posées, soit une poignée. Les articles qui partagent
 * une règle partagent donc leur mesure.
 */
@Injectable()
export class BoardElasticityService {
  constructor(private readonly volumes: SkuVolumeReader) {}

  /**
   * @param ruleDates la date d'entrée en vigueur de chaque règle, par
   *   identifiant. C'est elle qui date le changement de prix d'un article.
   */
  async enrich(
    board: PricingBoardView,
    ruleDates: ReadonlyMap<string, Date>,
    now: Date,
  ): Promise<PricingBoardView> {
    const altered = board.categories.flatMap((category) =>
      category.items.filter(hasAlteration).map((item) => ({ item, category })),
    );
    if (altered.length === 0) {
      return board;
    }

    const skus = altered.map((entry) => entry.item.sku);
    const changeDates = new Map(
      altered.map((entry) => [entry.item.sku, changedAt(entry.item, ruleDates, now)] as const),
    );

    const [rolling, sinceChange] = await Promise.all([
      this.measure(rollingWindows(now), skus),
      this.measureByChangeDate(changeDates, now),
    ]);

    return {
      ...board,
      categories: board.categories.map((category) =>
        withElasticity(category, rolling, sinceChange, changeDates),
      ),
    };
  }

  /** Une paire de fenêtres, deux requêtes, tous les SKU. */
  private async measure(windows: WindowPair, skus: readonly string[]): Promise<MeasuredWindows> {
    const [baseline, observed] = await Promise.all([
      this.volumes.volumesFor(skus, windows.baseline),
      this.volumes.volumesFor(skus, windows.observed),
    ]);
    return { windows, baseline, observed };
  }

  /**
   * Les articles sont **groupés par date de changement** : ceux qui partagent
   * une règle partagent leurs fenêtres, donc leur requête.
   */
  private async measureByChangeDate(
    changeDates: ReadonlyMap<string, Date | null>,
    now: Date,
  ): Promise<ReadonlyMap<string, MeasuredWindows>> {
    const bySkuGroup = new Map<string, string[]>();
    for (const [sku, date] of changeDates) {
      if (date === null) {
        continue;
      }
      const key = date.toISOString();
      bySkuGroup.set(key, [...(bySkuGroup.get(key) ?? []), sku]);
    }

    const measured = await Promise.all(
      [...bySkuGroup].map(async ([key, skus]) => {
        const windows = windowsAroundChange(new Date(key), now);
        return windows === null ? null : ([key, await this.measure(windows, skus)] as const);
      }),
    );
    return new Map(measured.filter((entry) => entry !== null));
  }
}

/** Un article dont le prix a bougé — les seuls à mesurer. */
function hasAlteration(item: PricingItemView): boolean {
  return item.finalMillicents !== item.canonicalMillicents;
}

/**
 * **Quand le prix de cet article a changé** : la plus récente des règles qui le
 * touchent aujourd'hui.
 *
 * La plus récente et non la plus ancienne : c'est ce moment-là qui a donné au
 * prix sa forme actuelle, et donc le seul point de coupure qui rende un
 * avant/après lisible. Une règle datée du futur (programmée) est ignorée — elle
 * n'a encore rien produit à mesurer.
 */
function changedAt(
  item: PricingItemView,
  ruleDates: ReadonlyMap<string, Date>,
  now: Date,
): Date | null {
  const dates = item.steps
    .map((step) => ruleDates.get(step.ruleId))
    .filter((date): date is Date => date !== undefined && date.getTime() <= now.getTime());
  if (dates.length === 0) {
    return null;
  }
  return dates.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest));
}

function withElasticity(
  category: PricingCategoryView,
  rolling: MeasuredWindows,
  sinceChange: ReadonlyMap<string, MeasuredWindows>,
  changeDates: ReadonlyMap<string, Date | null>,
): PricingCategoryView {
  return {
    ...category,
    items: category.items.map((item) => {
      if (!hasAlteration(item)) {
        return item;
      }
      const change = changeDates.get(item.sku) ?? null;
      const measured = change === null ? undefined : sinceChange.get(change.toISOString());
      return {
        ...item,
        elasticity: itemElasticity(item.canonicalMillicents, item.finalMillicents, {
          sinceChange: measured === undefined ? null : pairFor(item.sku, measured),
          rolling: pairFor(item.sku, rolling),
        }),
      };
    }),
  };
}

/** Un SKU absent de la mesure n'a rien vendu : zéro est ici la bonne lecture. */
function pairFor(sku: string, measured: MeasuredWindows): MeasuredPair {
  return {
    windows: measured.windows,
    baselineVolume: measured.baseline.get(sku) ?? 0,
    observedVolume: measured.observed.get(sku) ?? 0,
  };
}

/** Ré-exporté pour le lecteur du tableau, qui n'a pas à connaître les fenêtres. */
export type { VolumeWindow };
