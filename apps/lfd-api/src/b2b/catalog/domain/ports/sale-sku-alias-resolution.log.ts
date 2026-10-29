import type { SaleSkuAliasPair } from "../sale-sku-aliases.js";

/**
 * Les portes par lesquelles une référence de vente entre
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 5).
 */
export type SaleReferenceEntry = "order" | "quote" | "shop_quote" | "shop_cart" | "order_draft";

/**
 * **Chaque résolution d'alias à l'entrée est comptée** (§ 5, § 7 L4).
 *
 * C'est ce compte qui dira quand couper l'alias d'entrée (Q1 : 90 jours, puis
 * coupé quand il est à zéro depuis trente jours). Un journal, pas une écriture
 * en base : la moitié des portes sont des LECTURES (devis, panier relu), qui
 * n'écrivent rien (CLAUDE.md § 4).
 */
export abstract class SaleSkuAliasResolutionLog {
  abstract record(entry: SaleReferenceEntry, resolved: readonly SaleSkuAliasPair[]): void;
}
