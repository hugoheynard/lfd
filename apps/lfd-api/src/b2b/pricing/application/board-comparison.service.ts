import { Injectable } from "@nestjs/common";

import { mirrorWindow, variationBp, windowDays } from "../domain/comparison.js";
import { PricingBoardReader } from "./ports/pricing-board.reader.js";
import { ReversedComparisonWindowError } from "../domain/pricing-errors.js";
import { SkuVolumeReader } from "../domain/ports/sku-volume.reader.js";
import type {
  PricingBoardView,
  PricingComparisonItemView,
  PricingComparisonView,
  VolumeTierPriceView,
} from "@lfd/contracts";

/**
 * **Deux marqueurs sur l'axe du temps**, et ce qui a bougé entre eux.
 *
 * Rien de neuf n'est calculé ici : l'écran daté existe déjà, et le volume par
 * fenêtre aussi. Ce service les met côte à côte — c'est exactement pourquoi il
 * est court, et pourquoi il doit le rester. Le jour où il ferait sa propre
 * arithmétique de prix, il annoncerait un écart que la caisse ne connaît pas.
 *
 * Les deux lectures sont **concurrentes** : elles ne se parlent pas, et
 * l'attendre l'une après l'autre doublerait le temps d'un écran qu'on ouvre pour
 * répondre à un client au téléphone.
 */
@Injectable()
export class BoardComparisonService {
  constructor(
    private readonly board: PricingBoardReader,
    private readonly volumes: SkuVolumeReader,
  ) {}

  /**
   * @throws {ReversedComparisonWindowError} second marqueur avant le premier.
   */
  async compare(from: Date, to: Date): Promise<PricingComparisonView> {
    if (to.getTime() <= from.getTime()) {
      throw new ReversedComparisonWindowError(from, to);
    }
    const mirror = mirrorWindow(from, to);

    const [before, after] = await Promise.all([this.board.read(from), this.board.read(to)]);
    const skus = itemsOf(after).map((item) => item.sku);
    const [sold, soldBefore] = await Promise.all([
      this.volumes.volumesFor(skus, { from, to }),
      this.volumes.volumesFor(skus, mirror),
    ]);

    const asBefore = new Map(itemsOf(before).map((item) => [item.sku, item]));
    const items = itemsOf(after).map((item) =>
      comparisonItem(item, asBefore.get(item.sku) ?? item, {
        volume: sold.get(item.sku) ?? 0,
        previousVolume: soldBefore.get(item.sku) ?? 0,
      }),
    );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      previousFrom: mirror.from.toISOString(),
      days: windowDays(from, to),
      changedCount: items.filter((item) => item.fromMillicents !== item.toMillicents).length,
      items,
    };
  }
}

/** L'article, sa famille — la famille sert au regroupement à l'écran. */
interface FlatItem {
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly finalMillicents: number;
  readonly volumeTiers: readonly VolumeTierPriceView[] | null;
}

function itemsOf(board: PricingBoardView): FlatItem[] {
  return board.categories.flatMap((category) =>
    category.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      categoryId: category.id,
      categoryName: category.name,
      finalMillicents: item.finalMillicents,
      volumeTiers: item.volumeTiers,
    })),
  );
}

/**
 * Un article absent de la lecture d'avant se compare **à lui-même** : même prix
 * des deux côtés, donc une variation nulle.
 *
 * C'est le cas d'un article entré au catalogue entre les deux marqueurs. Le
 * compter comme une variation depuis zéro afficherait « +∞ % » sur une nouveauté
 * — un chiffre spectaculaire qui ne dit rien de ce qu'on a décidé.
 */
function comparisonItem(
  item: FlatItem,
  before: FlatItem,
  sales: { volume: number; previousVolume: number },
): PricingComparisonItemView {
  return {
    sku: item.sku,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    fromMillicents: before.finalMillicents,
    toMillicents: item.finalMillicents,
    fromTiers: before.volumeTiers,
    toTiers: item.volumeTiers,
    priceVariationBp: variationBp(before.finalMillicents, item.finalMillicents),
    volume: sales.volume,
    previousVolume: sales.previousVolume,
    volumeVariationBp: variationBp(sales.previousVolume, sales.volume),
  };
}
