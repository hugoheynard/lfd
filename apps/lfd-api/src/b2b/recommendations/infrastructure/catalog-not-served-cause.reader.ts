import type { CatalogAdminItemView, StaffSuggestionReader } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { CatalogAdminReader } from "../../catalog/domain/ports/catalog-admin.reader.js";
import { SaleSkuAliasReader } from "../../catalog/domain/ports/sale-sku-alias.reader.js";
import { audienceIncludes } from "../../catalog/domain/served-to.js";
import { NotServedCauseReader } from "../domain/ports/not-served-cause.reader.js";
import type { NotServedCause } from "../domain/services/suggestion-alerts.js";

/**
 * La cause, lue au **paramétrage** du catalogue (`CatalogAdminReader`) : il
 * voit les masqués et les articles hors gamme, retirés exclus. Aucune
 * déclinaison du produit : retiré. Aucune dans la gamme du lecteur : hors
 * gamme. Toutes celles de sa gamme masquées pour lui : masqué. Sinon (attente
 * de validation, étiquette ou taux absent) : non servi à cette clientèle.
 *
 * Le paramétrage est lu entier, une fois par appel — l'alerte ne l'appelle
 * qu'avec des SKU déjà refusés, rarement plus d'une poignée.
 *
 * Par SKU de VENTE, après l'alias (`plan-defaut-sous-sa-reference.md`, L3) :
 * il filtrait par référence produit, donc toutes les déclinaisons d'une fiche,
 * tant que le défaut se vendait sous elle. Une ancienne référence se juge
 * comme sa cible, et la clé rendue reste celle demandée.
 */
@Injectable()
export class CatalogNotServedCauseReader extends NotServedCauseReader {
  constructor(
    private readonly admin: CatalogAdminReader,
    private readonly aliases: SaleSkuAliasReader,
  ) {
    super();
  }

  async causesOf(
    shopSkus: readonly string[],
    audience: StaffSuggestionReader,
  ): Promise<ReadonlyMap<string, NotServedCause>> {
    if (shopSkus.length === 0) {
      return new Map();
    }
    const [items, aliases] = await Promise.all([this.admin.list(), this.aliases.around(shopSkus)]);
    return new Map(
      shopSkus.map((sku) => [
        sku,
        causeOf(
          items.filter((item) => item.sku === aliases.canonical(sku)),
          audience,
        ),
      ]),
    );
  }
}

/** Exportée pour le test : la cause d'un article, par ses lignes au paramétrage. */
export function causeOf(
  variants: readonly CatalogAdminItemView[],
  audience: StaffSuggestionReader,
): NotServedCause {
  if (variants.length === 0) {
    return "withdrawn";
  }
  const inRange = variants.filter((variant) => audienceIncludes(variant.audience, audience));
  if (inRange.length === 0) {
    return "not_for_audience";
  }
  const hidden = inRange.every((variant) =>
    audience === "pro" ? variant.isHidden : variant.isHiddenPublic,
  );
  return hidden ? "hidden_for_audience" : "not_for_audience";
}
