import type { CartAdjustment } from "./cart-adjustment.js";
import type { CompanyStatus } from "./customer-sheet.js";
import type { DiscountLabelView } from "./discount-label.js";

/**
 * **Ce que couvre la remise d'un point de retrait**, sans zod — la boutique
 * peut le lire au démarrage (même raison de poids que
 * `pickup-discount-audiences.ts`), et le serveur s'en sert au devis comme à la
 * passation. `pickup.ts` porte le schéma, qui reste l'autorité sur la forme.
 *
 * `documentation/promotions/promotions.md`, § 2.17
 * (Hugo, 2026-10-22) : une remise par clientèle, chacune avec un MODE de
 * portée et des règles par catégorie et par produit.
 */

/**
 * Le mode de portée : `all_except` = toutes les lignes sauf celles que les
 * règles retirent (l'existant) ; `only` = aucune ligne sauf celles que les
 * règles incluent.
 */
export type PickupDiscountScope = "all_except" | "only";

/** Une règle sur une famille du catalogue : ses lignes sont éligibles ou non. */
export interface PickupDiscountCategoryRule {
  readonly categoryId: string;
  readonly eligible: boolean;
}

/** Une règle sur un produit — elle couvre toutes ses déclinaisons (Q2). */
export interface PickupDiscountProductRule {
  readonly productId: string;
  readonly eligible: boolean;
}

/** La remise d'un point pour UNE clientèle. */
export interface AudiencePickupDiscount {
  readonly adjustment: CartAdjustment;
  /**
   * Le libellé de la promotion pour CETTE clientèle (L8b, § 15.8) ; absent
   * sous l'ancien chemin et sur la fiche d'un site, qui n'en a pas.
   */
  readonly label?: DiscountLabelView | undefined;
  readonly scope: PickupDiscountScope;
  readonly categories: readonly PickupDiscountCategoryRule[];
  readonly products: readonly PickupDiscountProductRule[];
}

/** Les deux remises d'un point ; `null` = cette clientèle n'en reçoit pas. */
export interface PickupDiscounts {
  readonly b2b: AudiencePickupDiscount | null;
  readonly b2c: AudiencePickupDiscount | null;
}

/**
 * **Ce qu'un point ANNONCE**, une remise par acheteur type — la forme servie
 * (`PickupAddressView.discounts`), là où {@link PickupDiscounts} reste la
 * forme saisie sur un site.
 *
 * `b2bPending` existe parce que la clientèle ment pour une société EN
 * ATTENTE : `audienceOf('pending')` dit `b2c` (une remise « pros
 * seulement » ne s'obtient pas en tapant un SIRET), mais la caisse la sert
 * en pro et juge les publics avec son statut — `pros` l'admet,
 * `individuals` non. Lui annoncer la remise `b2c` promettait une promotion
 * « particuliers » que la caisse ne retirait pas (corrigé le 2026-10-31,
 * Hugo, option a) : elle lit désormais la sienne.
 *
 * Toujours rendu par l'annonce des promotions ; facultatif dans le TYPE,
 * comme `pickupAudiences`, pour la vue d'un site (forme saisie, sans
 * société en attente) et les vues construites à la main : absent = aucune
 * remise annoncée, jamais celle d'une autre clientèle.
 */
export interface AnnouncedPickupDiscounts extends PickupDiscounts {
  readonly b2bPending?: AudiencePickupDiscount | null | undefined;
}

/** L'acheteur type dont on lit l'annonce d'un point. */
export type PickupAnnouncementKey = keyof AnnouncedPickupDiscounts;

/** Aucune remise, pour personne. */
export const NO_PICKUP_DISCOUNTS: AnnouncedPickupDiscounts = {
  b2b: null,
  b2c: null,
  b2bPending: null,
};

/**
 * **Quelle annonce lire, selon le statut de la société agissante** : active
 * → `b2b`, en attente → `b2bPending`, sinon `b2c`. Distincte d'`audienceOf`,
 * qui règle aussi les CGV et le contact : seule l'annonce d'une remise doit
 * suivre ce que la caisse appliquera à une société en attente.
 */
export function pickupAnnouncementOf(
  actingCompanyStatus: CompanyStatus | null,
): PickupAnnouncementKey {
  if (actingCompanyStatus === "active") {
    return "b2b";
  }
  return actingCompanyStatus === "pending" ? "b2bPending" : "b2c";
}

/** La remise annoncée du point pour cet acheteur type, ou `null`. */
export function pickupDiscountFor(
  point: { readonly discounts: AnnouncedPickupDiscounts },
  key: PickupAnnouncementKey,
): AudiencePickupDiscount | null {
  return point.discounts[key] ?? null;
}

/** Ce qu'il faut savoir d'une ligne pour juger son éligibilité. */
export interface PickupDiscountLineFacts {
  /** `null` = produit inconnu du catalogue : seul le mode décide. */
  readonly productId: string | null;
  /** La famille de la ligne puis ses parentes, la plus proche en tête. */
  readonly categoryPath: readonly string[];
}

/**
 * **La ligne entre-t-elle dans l'assiette de la remise ?**
 *
 * 1. une règle sur son PRODUIT l'emporte (Q1 : on réinclut un produit dans
 *    une famille exclue, ou on l'exclut d'une famille remisée) ;
 * 2. sinon la règle de la famille LA PLUS PROCHE — la même lecture de lignée
 *    que la tarification ;
 * 3. sinon le mode : `all_except` éligible, `only` non.
 */
export function pickupDiscountCovers(
  discount: AudiencePickupDiscount,
  line: PickupDiscountLineFacts,
): boolean {
  const product =
    line.productId === null
      ? undefined
      : discount.products.find((rule) => rule.productId === line.productId);
  if (product !== undefined) {
    return product.eligible;
  }
  for (const categoryId of line.categoryPath) {
    const rule = discount.categories.find((candidate) => candidate.categoryId === categoryId);
    if (rule !== undefined) {
      return rule.eligible;
    }
  }
  return discount.scope === "all_except";
}

/** La remise a-t-elle des règles ? Sans règle en `all_except`, toute ligne est éligible. */
export function pickupDiscountHasRules(discount: AudiencePickupDiscount): boolean {
  return (
    discount.scope === "only" || discount.categories.length > 0 || discount.products.length > 0
  );
}
