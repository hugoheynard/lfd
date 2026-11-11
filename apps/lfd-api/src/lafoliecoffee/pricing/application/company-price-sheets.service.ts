import type { CompanyPricingCategoryView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import { CatalogViewers } from "../../catalog/application/catalog-viewers.service.js";
import { familyView } from "../../catalog/domain/catalog-family.js";
import { LinePromotionSupply } from "../../promotions/application/line-promotion-supply.js";
import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import { lotBuyerOf, type PricingParties } from "../domain/loaded-pricer.js";
import { pricingContextFor } from "../domain/pricing-context.js";
import { VolumeLadderReader } from "../domain/ports/volume-ladder.reader.js";
import { groupByFamily } from "./board-category.js";
import { boardDecisions, boardMaterials, itemView } from "./board-item.js";
import { CompanyPriceSheets, type CompanyPriceSheet } from "./ports/company-price-sheet.js";
import { PricingDecisionsReader } from "./ports/pricing-decisions.reader.js";

/**
 * La feuille de prix d'un client, lue sur les ports de la tarification.
 *
 * Le prix vient de `itemView`, **la même composition que le tableau général**,
 * qui appelle `resolvePrice`, la fonction qui facture. Le filtre d'audience vit
 * dans la requête des décisions : une règle d'un tiers ne peut ni gagner un
 * étage ni apparaître dans une trace.
 *
 * Datée : les décisions (`decisionsAt`), les barèmes (`listAll`) et les
 * promotions de ligne (`forLot`, fenêtre jugée à `at`) se lisent à `at`. Le
 * catalogue, lui, est celui d'aujourd'hui — le port n'a pas de lecture datée
 * des tarifs de référence (vérifié le 2026-11-11).
 */
@Injectable()
export class PortsCompanyPriceSheets extends CompanyPriceSheets {
  constructor(
    private readonly decisions: PricingDecisionsReader,
    private readonly catalog: ProductCatalogReader,
    private readonly ladders: VolumeLadderReader,
    private readonly viewers: CatalogViewers,
    private readonly linePromotions: LinePromotionSupply,
  ) {
    super();
  }

  async sheetFor(companyId: string, parties: PricingParties, at: Date): Promise<CompanyPriceSheet> {
    const [ladders, catalogue] = await Promise.all([
      this.ladders.listAll(at),
      // Au nom de CE client (`plan-articles-sur-mesure.md`, Q1) : ce qui est
      // réservé à un autre compte n'en sort pas ; une ligne déjà posée dessus
      // reste, étiquetée.
      this.viewers.regarding(companyId).then((viewer) => this.catalog.all(viewer)),
    ]);
    // Après le catalogue : une vue de plancher porte l'écart au tarif de
    // référence, donc a besoin des articles.
    const articles = catalogue.filter((article) => article.reservation !== "other");
    const decided = await this.decisions.decisionsAt(at, { companyId }, articles);
    // Comme la caisse (plan des promotions, L8, L12) : l'étage promotion
    // vient des promotions de CE client.
    const { rules, promotions } = boardDecisions(
      decided.rules,
      await this.linePromotions.forLot(lotBuyerOf(parties), at, false),
    );
    const floors = decided.floors;
    const shelves = groupByFamily(articles);

    return {
      at,
      parties,
      catalogue,
      rules,
      async categoriesWith(
        mercuriale: CompanyMercuriale | null,
      ): Promise<CompanyPricingCategoryView[]> {
        const materials = await boardMaterials(
          rules,
          floors,
          at,
          mercuriale,
          ladders,
          parties,
          promotions,
        );
        return shelves.map((shelf) => ({
          id: shelf.family.id,
          name: shelf.family.name,
          family: familyView(shelf.family),
          items: shelf.articles.map((article) =>
            itemView(
              article.article,
              pricingContextFor({ ...article.article, sku: article.sku }, 1, parties, at),
              materials,
              { rules, floors },
            ),
          ),
        }));
      },
    };
  }
}
