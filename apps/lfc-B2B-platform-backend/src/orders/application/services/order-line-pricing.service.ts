import { Injectable } from "@nestjs/common";
import type { OrderLineInput as OrderLineRequest, VolumeTierPriceView } from "@lfd/contracts";

import { decideFloor } from "../../../pricing/domain/floor-policy.js";
import { observedRatioBp } from "../../../pricing/domain/elasticity.js";
import { pricingContextFor } from "../../../pricing/application/pricing-context.js";
import { rollingWindows } from "../../../pricing/domain/elasticity-windows.js";
import { volumeTierPrices } from "../../../pricing/application/volume-tier-prices.js";
import { floorCentsFor, resolveScopedFloor } from "../../../pricing/domain/resolve-floor.js";
import { ladderAsRule } from "../../../pricing/domain/volume-ladder.js";
import { resolvePrice } from "../../../pricing/domain/resolve-price.js";
import { PriceFloorReader } from "../../../pricing/domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "../../../pricing/domain/ports/price-rule.reader.js";
import { SkuVolumeReader } from "../../../pricing/domain/ports/sku-volume.reader.js";
import { VolumeLadderReader } from "../../../pricing/domain/ports/volume-ladder.reader.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import { UnknownSkuError } from "../../domain/errors/order-errors.js";
import type { PriceRule, ScopedPriceFloor } from "../../../pricing/domain/price-rule.js";
import type { OrderLineInput } from "../../domain/value-objects/order-line.js";
import type { OrderParties } from "./order-parties.js";

/**
 * Une ligne résolue : **ce qui part sur la commande**, et ce qui n'y part pas.
 *
 * `line` est le seul morceau que la commande persiste — le reste explique le
 * prix sans en faire partie. La distinction est volontaire : un devis a besoin
 * de dire « et à 100 pièces, ce serait ça », une facture n'a pas à figer une
 * grille de paliers dont aucun n'a été retenu.
 */
export interface ResolvedOrderLine {
  readonly line: OrderLineInput;
  /** Le tarif de liste d'entrée, avant le moindre étage. */
  readonly canonicalCents: number;
  /** La mercuriale qui a scellé la chaîne pour cette ligne, ou `null`. */
  readonly sealedByRuleId: string | null;
  /** Les règles écartées par ce scellement. */
  readonly sealedRuleIds: readonly string[];
  /**
   * Le barème qui vise l'article, résolu **palier par palier**, ou `null`.
   *
   * C'est la réponse à « et si j'en prends 100 ? » — la question que le
   * commercial pose au téléphone, et la seule façon d'éprouver le système sur
   * des volumes sans passer dix commandes pour le savoir.
   */
  readonly volumeTiers: readonly VolumeTierPriceView[] | null;
  /** Le plancher qui vise l'article, en centimes, ou `null` s'il n'y en a pas. */
  readonly floorCents: number | null;
}

/**
 * **Le prix d'une ligne de panier**, et rien d'autre.
 *
 * Extrait de `OrderDrafting`, qui composait à la fois le prix ET l'acheminement
 * — deux raisons de changer dans un même fichier de bientôt quatre cents
 * lignes. Ici vivent le catalogue, les règles, les barèmes et les planchers ;
 * là-bas restent les points de retrait, les zones et les défauts de livraison.
 *
 * Le découpage a aussi un effet sur les dépendances : le devis n'a plus besoin
 * de traverser un service qui sait résoudre une zone de livraison pour obtenir
 * un prix.
 */
@Injectable()
export class OrderLinePricing {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly priceRules: PriceRuleReader,
    private readonly priceFloors: PriceFloorReader,
    private readonly skuVolumes: SkuVolumeReader,
    private readonly volumeLadders: VolumeLadderReader,
  ) {}

  /**
   * Fusionne les lignes par SKU (quantités additionnées) puis résout chacune —
   * c'est ici que le prix devient autoritaire, jamais celui du client.
   *
   * Trois étapes, dans cet ordre : le **catalogue** donne le prix canonique, les
   * **règles tarifaires** l'altèrent, et le **plancher** arbitre le résultat. La
   * fusion par SKU précède les trois, et c'est ce qui rend le palier de volume
   * juste : deux lignes de 60 croissants ouvrent le palier « 100+ », alors
   * qu'aucune ne l'ouvrirait seule.
   *
   * @throws {UnknownSkuError} un SKU que le catalogue ne connaît pas.
   */
  async resolve(
    input: readonly OrderLineRequest[],
    parties: OrderParties,
  ): Promise<ResolvedOrderLine[]> {
    const quantities = new Map<string, number>();
    for (const line of input) {
      quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
    }

    // L'instant est pris UNE fois pour toute la commande : deux lignes résolues à
    // quelques millisecondes d'écart pourraient sinon tomber de part et d'autre
    // du basculement d'une promotion.
    const at = new Date();

    // Le catalogue est résolu EN UN LOT, avant la boucle : depuis qu'il vient de
    // la base, le résoudre ligne à ligne ferait une requête par ligne de panier
    // sur le chemin qui facture.
    const catalogue = await this.catalog.resolveMany([...quantities.keys()]);

    return Promise.all(
      [...quantities].map(async ([sku, quantity]) => {
        const item = catalogue.get(sku) ?? null;
        if (item === null) {
          throw new UnknownSkuError(sku);
        }
        return this.resolveOne(item, quantity, parties, at);
      }),
    );
  }

  /** Une ligne, une fois son article connu et sa quantité fusionnée. */
  private async resolveOne(
    item: { sku: string; name: string; unitPriceCents: number; vatRate: number; category: string },
    quantity: number,
    parties: OrderParties,
    at: Date,
  ): Promise<ResolvedOrderLine> {
    const context = pricingContextFor(item.sku, item.category, quantity, parties, at);
    const [rules, floors, ladders] = await Promise.all([
      this.priceRules.candidatesFor(context),
      this.priceFloors.candidatesFor(context),
      this.volumeLadders.candidatesFor(context),
    ]);

    // Le barème de volume rejoint les règles sous la forme de la règle d'étage
    // volume qu'il est à CETTE quantité. La spécificité arbitre ensuite comme
    // d'habitude — un barème de produit l'emporte sur celui de sa famille, sans
    // que la résolution apprenne un cas de plus.
    const volumeRules = ladders
      .map((ladder) => ladderAsRule(ladder, context))
      .filter((rule): rule is PriceRule => rule !== null);

    // Quel plancher VISE cet article, puis lequel de ses étages s'ouvre : deux
    // questions distinctes, la seconde dépendant de la commande et de l'historique.
    const scoped = resolveScopedFloor(floors, context);
    const decision =
      scoped === null
        ? null
        : decideFloor(scoped.policy, {
            quantity,
            observedVolumeRatioBp: await this.observedRatio(item.sku, scoped, at),
          });
    const applied = decision?.applied ?? null;
    const resolved = resolvePrice(
      item.unitPriceCents,
      [...rules, ...volumeRules],
      context,
      applied,
    );

    return {
      line: {
        sku: item.sku,
        productName: item.name,
        unitPriceCents: resolved.finalCents,
        vatRate: item.vatRate,
        quantity,
        // La trace part avec le prix, et pour la même raison : dans six mois, les
        // règles qui l'ont produit peuvent avoir été retirées. Sans elle, la seule
        // réponse à « pourquoi ce prix ? » serait « c'était le prix ».
        pricing: {
          basePriceCents: resolved.basePriceCents,
          steps: resolved.steps,
          floored: resolved.floored,
          // La décision de plancher est figée AVEC le prix. C'est ce qui rend le
          // plancher dynamique tenable : sans la mesure consignée, un prix qui
          // dépend de l'historique cesse d'être explicable dès que l'historique
          // bouge. Elle ne se relit jamais.
          floorDecision:
            decision === null
              ? null
              : {
                  tier: decision.tier,
                  floorCents: floorCentsFor(decision.applied, item.unitPriceCents),
                  observedVolumeRatioBp: decision.unlock?.observedVolumeRatioBp ?? null,
                  quantityMet: decision.unlock?.quantityMet ?? true,
                  volumeMet: decision.unlock?.volumeMet ?? true,
                },
        },
      },
      canonicalCents: item.unitPriceCents,
      sealedByRuleId: resolved.sealedByRuleId,
      sealedRuleIds: resolved.sealedRuleIds,
      // `rules` SANS `volumeRules` : `volumeTierPrices` réinjecte lui-même le
      // barème à la quantité de chaque palier. Lui passer la chaîne complète
      // dupliquait l'échelle, et deux règles de même identifiant à l'étage
      // volume rendaient la résolution ambiguë — 400 sur une commande de 20.
      volumeTiers: volumeTierPrices(item.unitPriceCents, ladders, rules, context, applied),
      floorCents: applied === null ? null : floorCentsFor(applied, item.unitPriceCents),
    };
  }

  /**
   * Le ratio de volume observé sur cet article — **uniquement quand il décide
   * de quelque chose**.
   *
   * Aucune requête si le plancher n'a pas de porte, ou si sa clé ne parle pas de
   * volume : la très grande majorité des commandes ne paie donc rien pour cette
   * mesure. C'est la seule façon d'admettre une lecture d'historique sur le
   * chemin qui facture sans le ralentir pour tout le monde.
   */
  private async observedRatio(
    sku: string,
    scoped: ScopedPriceFloor,
    at: Date,
  ): Promise<number | null> {
    if (scoped.policy.dynamic?.unlock.minVolumeRatioBp == null) {
      return null;
    }
    const windows = rollingWindows(at);
    const [baseline, observed] = await Promise.all([
      this.skuVolumes.volumesFor([sku], windows.baseline),
      this.skuVolumes.volumesFor([sku], windows.observed),
    ]);
    return observedRatioBp(baseline.get(sku) ?? 0, observed.get(sku) ?? 0);
  }
}
