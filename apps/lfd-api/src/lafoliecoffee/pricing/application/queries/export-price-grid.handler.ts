import type { PriceGridExportPayload } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { AdmittedPromotion } from "../../../promotions/domain/live-promotion.js";
import {
  lineSealingOf,
  needsClassifications,
} from "../../../orders/domain/services/basket-promotion-choice.js";
import {
  OrderLineClassificationReader,
  type OrderLineClassification,
} from "../../../orders/domain/ports/order-line-classification.reader.js";
import { PriceGridPromotionNotApplicableError } from "../../domain/errors/price-grid-errors.js";
import {
  priceGridCsv,
  priceGridFileName,
  type PriceGridHeading,
} from "../../domain/price-grid-csv.js";
import {
  priceGridRowOf,
  type PriceGridRow,
  type RetainedBasketPromotion,
} from "../../domain/price-grid-row.js";
import {
  PriceGridShelfReader,
  type PriceGridShelf,
} from "../../domain/ports/price-grid-shelf.reader.js";
import { Pricer } from "../pricer.js";
import { PriceGridContexts, type PriceGridContext } from "../price-grid-context.js";
import { PriceGridPromotions } from "../price-grid-promotions.js";
import { ExportPriceGridQuery, type PriceGridFile } from "./export-price-grid.query.js";

/** Le rayon montre le prix d'UNE unité : la quantité de la vitrine (`ShopCataloguePricing`). */
const SHELF_QUANTITY = 1;

/**
 * **La grille de prix d'un public** (`plan-export-grille-de-prix.md`, § 4).
 *
 * Chaque prix passe par la porte (`Pricer.load`), avec l'acheteur du public
 * choisi — une société servie, un particulier par sa porte d'entrée, ou un pro
 * type (§ 8) — à la date choisie : la question même du rayon. Les remises au panier retenues passent par la règle de la caisse,
 * article par article (`priceGridRowOf`). Rien n'est écrit.
 */
@QueryHandler(ExportPriceGridQuery)
export class ExportPriceGridHandler implements IQueryHandler<ExportPriceGridQuery, PriceGridFile> {
  constructor(
    private readonly contexts: PriceGridContexts,
    private readonly promotions: PriceGridPromotions,
    private readonly shelves: PriceGridShelfReader,
    private readonly pricer: Pricer,
    private readonly classifications: OrderLineClassificationReader,
  ) {}

  /**
   * @throws {PriceGridPromotionNotApplicableError} une remise cochée ne s'applique plus.
   */
  async execute({ payload }: ExportPriceGridQuery): Promise<PriceGridFile> {
    const context = await this.contexts.contextOf(payload);
    const [set, shelf] = await Promise.all([
      this.promotions.of(context),
      this.shelves.shelfFor(context.viewer, context.judgedAt),
    ]);
    const chosen = chosenOf(payload.basketPromotions, set.basket);
    const retained = chosen.flatMap(({ promotion, part }) =>
      part === "ignored" ? [] : [{ promotion, part }],
    );
    const rows = await this.rowsOf(shelf, context, retained);
    const heading: PriceGridHeading = {
      audience: context.labels.audience,
      day: context.labels.day,
      fulfillment: context.labels.fulfillment,
      basis: context.basis,
      remarks: context.labels.remarks,
      displayedPromotions: set.displayedPrice.map((promotion) => promotion.servedLabel.fr),
      basketPromotions: chosen.map(({ promotion, part }) => ({
        label: promotion.servedLabel.fr,
        part,
      })),
      pricePerKg: payload.pricePerKg,
    };
    return {
      fileName: priceGridFileName(context.labels.audience, context.day),
      csv: priceGridCsv(heading, rows),
    };
  }

  private async rowsOf(
    shelf: PriceGridShelf,
    context: PriceGridContext,
    retained: readonly RetainedBasketPromotion[],
  ): Promise<readonly PriceGridRow[]> {
    if (shelf.articles.length === 0) {
      return [];
    }
    const [lot, classifications] = await Promise.all([
      this.pricer.load({
        articles: shelf.articles.map(({ article }) => ({ article, quantity: SHELF_QUANTITY })),
        buyer: context.buyer,
        lens: context.lens,
        at: context.at,
        caller: "back-office",
      }),
      this.classificationsFor(shelf, retained),
    ]);
    return shelf.articles.map((entry) => {
      const priced = lot.price(entry.article.sku, SHELF_QUANTITY);
      return priceGridRowOf(
        {
          sku: entry.article.sku,
          familyName: entry.familyName,
          productName: entry.productName,
          variantName: entry.article.name,
          saleUnit: entry.article.saleUnit,
          vatRate: entry.vatRate,
          // Le tarif d'entrée de la PORTE — celui de la date demandée.
          baseMillicents: priced.canonicalMillicents,
          displayedMillicents: priced.finalMillicents,
          sealing: lineSealingOf(priced),
          enteredPerKg: entry.enteredPerKg,
        },
        retained,
        classifications,
        context.basis,
      );
    });
  }

  /** Le rangement des articles — lu seulement si une remise retenue a des règles de portée. */
  private classificationsFor(
    shelf: PriceGridShelf,
    retained: readonly RetainedBasketPromotion[],
  ): Promise<ReadonlyMap<string, OrderLineClassification>> {
    return needsClassifications(retained.map(({ promotion }) => promotion))
      ? this.classifications.classify(shelf.articles.map(({ article }) => article.sku))
      : Promise.resolve(new Map());
  }
}

/**
 * Les remises cochées, dans l'ordre du panneau, rapprochées de celles que ce
 * public reçoit vraiment. Une remise cochée qui n'en fait plus partie est
 * refusée : l'ignorer produirait un fichier qui la tait sans le dire.
 */
function chosenOf(
  requested: PriceGridExportPayload["basketPromotions"],
  admitted: readonly AdmittedPromotion[],
): readonly {
  readonly promotion: AdmittedPromotion;
  readonly part: PriceGridExportPayload["basketPromotions"][number]["part"];
}[] {
  const byId = new Map(admitted.map((promotion) => [promotion.id, promotion]));
  return requested.map(({ promotionId, part }) => {
    const promotion = byId.get(promotionId);
    if (promotion === undefined) {
      throw new PriceGridPromotionNotApplicableError(promotionId);
    }
    return { promotion, part };
  });
}
