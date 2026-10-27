import { ROOT_CONTEXT_KEY } from "../../../../sales-contexts/domain/value-objects/bootstrap-contexts.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { VariantSnapshot } from "../entities/variant.js";

/** Ce qui manque à une déclinaison pour se vendre — des clés, que l'écran traduit. */
export const PRICE_GAP = "price";
export const ALLERGENS_GAP = "allergens";
/**
 * Le prix pro HT n'est pas saisi — seule source depuis le lot R3
 * (`plan-retirer-le-rapport-pro.md`, 2026-10-27).
 *
 * ⚠️ `pro_price_rule` (« rapport pro non réglé ») n'est plus calculé depuis le
 * même lot : la clé n'existe plus que dans des manques publiés avant, et
 * l'écran garde son libellé pour les relire.
 */
export const PRO_PRICE_GAP = "pro_price";
/** Un taux manque au contexte nommé — `vat:b2b`, `vat:eatIn`. */
export const VAT_GAP_PREFIX = "vat:";

/**
 * Ce qu'une déclinaison ne voit pas d'elle-même, et qui décide de sa
 * complétude : les contextes de vente EN SERVICE. (La règle du prix pro en
 * faisait partie jusqu'au lot R3 : le prix pro est désormais toujours saisi.)
 */
export interface CompletenessRules {
  /** Les clés des contextes de vente en service (`SalesContext.active`). */
  readonly activeContextKeys: readonly string[];
}

/** Ce que la règle lit d'une déclinaison — RÉSOLUE (une alignée porte le défaut). */
export type CompletenessInput = Pick<
  VariantSnapshot,
  "priceCents" | "proPriceMillicents" | "allergenSheet"
>;

/**
 * Les contextes dont le taux est exigé : tous ceux en service, et le contexte
 * racine `b2b` en toute circonstance.
 *
 * Tous ceux en service, **quelle que soit l'audience** (Hugo, 2026-10-15 :
 * « n'importe quelle fiche devrait être en capacité de servir n'importe quel
 * contexte ») : l'audience dit à qui l'on vend aujourd'hui, et en changer ne
 * doit jamais rendre une fiche invendable.
 *
 * Le `b2b` toujours, même s'il était un jour mis hors service : la plateforme
 * range un article vendable avec son prix pro hors taxe
 * (`catalog_items.price_millicents`, `NOT NULL`), qui ne se calcule pas sans
 * lui. On ne fabrique pas un prix pro que personne n'a décidé.
 */
export function requiredContexts(rules: CompletenessRules): string[] {
  return [...new Set([ROOT_CONTEXT_KEY, ...rules.activeContextKeys])];
}

/**
 * **La règle de complétude d'une déclinaison** — l'UNIQUE définition, que
 * l'activation (`activation-gaps.ts`) et les faits du catalogue
 * (`catalog-facts.ts`) appellent tous deux (lot 2b de
 * `plan-catalogue-synchronise-par-audience.md`).
 *
 * Complète = un prix public, ses allergènes déclarés (`[]` est une
 * déclaration), un prix pro HT saisi, et un taux pour chaque contexte
 * requis. Vide = complète.
 *
 * Pure : le taux arrive résolu (famille, dérogation, registre), comme la
 * projection le résout. Une déclinaison arrêtée n'est pas jugée ici — c'est
 * à l'appelant de l'écarter : rien ne lui manque, elle ne se vend plus.
 */
export function variantGaps(
  variant: CompletenessInput,
  percents: CategoryVatPercents,
  rules: CompletenessRules,
): string[] {
  const missing: string[] = [];
  if (variant.priceCents === null) {
    missing.push(PRICE_GAP);
  }
  if (variant.allergenSheet === null) {
    missing.push(ALLERGENS_GAP);
  }
  // Le prix pro HT saisi est sa seule source (lot R3) : sans saisie, c'est la
  // section « Tarif » qu'il faut ouvrir. Le taux `b2b` qui le facture est
  // jugé avec les autres taux, ci-dessous.
  if (variant.proPriceMillicents === null) {
    missing.push(PRO_PRICE_GAP);
  }
  for (const context of requiredContexts(rules)) {
    if (percents[context] === undefined) {
      missing.push(`${VAT_GAP_PREFIX}${context}`);
    }
  }
  return missing;
}
