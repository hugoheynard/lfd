import type { ShopAudience } from "../../domain/ports/catalog.reader.js";

/**
 * Qui demande les options du rayon : un visiteur sans jeton, dont la route
 * nomme la vitrine (`public`, ou `pro` pour la visite pro — la même règle que
 * `GET /shop/catalogue`), ou un client reconnu, dont la société vient du
 * contexte de la requête et jamais de l'URL.
 */
export type ShopOptionGroupsCaller =
  | { readonly kind: "visitor"; readonly audience: ShopAudience }
  | { readonly kind: "recognised"; readonly companyId: string | null };

/**
 * **Les options que l'appelant peut choisir**, article par article
 * (`documentation/catalogue/plan-options-de-commande.md`, § 3.3).
 */
export class ReadShopOptionGroupsQuery {
  constructor(readonly caller: ShopOptionGroupsCaller) {}
}
