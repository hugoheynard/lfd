import { proPriceOf, type ProPricePolicy } from "@lfd/pim-contracts";

import { ROOT_CONTEXT_KEY } from "../../../../sales-contexts/domain/value-objects/bootstrap-contexts.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { VariantSnapshot } from "../entities/variant.js";

/** Ce qui manque à une déclinaison pour se vendre — des clés, que l'écran traduit. */
export const PRICE_GAP = "price";
export const ALLERGENS_GAP = "allergens";
/** Le rapport pro n'est pas réglé : aucun prix pro ne se calcule. */
export const PRO_PRICE_RULE_GAP = "pro_price_rule";
/**
 * Le prix pro ne se résout pas : sous `entered` sans saisie, la méthode
 * n'offre aucun repli (lot P, « la saisie prime »).
 */
export const PRO_PRICE_GAP = "pro_price";
/** Un taux manque au contexte nommé — `vat:b2b`, `vat:eatIn`. */
export const VAT_GAP_PREFIX = "vat:";

/**
 * Ce qu'une déclinaison ne voit pas d'elle-même, et qui décide de sa
 * complétude : les contextes de vente EN SERVICE et la règle du prix pro.
 */
export interface CompletenessRules {
  /** Les clés des contextes de vente en service (`SalesContext.active`). */
  readonly activeContextKeys: readonly string[];
  /** `null` = le rapport pro n'est pas réglé. */
  readonly policy: ProPricePolicy | null;
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
 * déclaration), un prix pro que `proPriceOf` résout (la saisie, ou le repli de
 * la méthode), et un taux pour chaque contexte requis. Vide = complète.
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
  const proGap = proPriceGap(variant, percents, rules.policy);
  if (proGap !== null) {
    missing.push(proGap);
  }
  for (const context of requiredContexts(rules)) {
    if (percents[context] === undefined) {
      missing.push(`${VAT_GAP_PREFIX}${context}`);
    }
  }
  return missing;
}

/**
 * Le prix pro, jugé par la porte elle-même (`proPriceOf`) quand elle peut
 * l'être : un prix et le taux `b2b` présents. Sans eux, leur manque est déjà
 * nommé — sauf sous `entered` sans saisie, qui se nomme toujours : c'est la
 * section « Tarif » qu'il faut ouvrir, pas l'écran des taux.
 */
function proPriceGap(
  variant: CompletenessInput,
  percents: CategoryVatPercents,
  policy: ProPricePolicy | null,
): string | null {
  if (policy === null) {
    return PRO_PRICE_RULE_GAP;
  }
  if (policy.method === "entered" && variant.proPriceMillicents === null) {
    return PRO_PRICE_GAP;
  }
  const b2bPercent = percents[ROOT_CONTEXT_KEY];
  if (variant.priceCents === null || b2bPercent === undefined) {
    return null;
  }
  const proPrice = proPriceOf(variant.priceCents, policy, b2bPercent, variant.proPriceMillicents);
  return proPrice === null ? PRO_PRICE_GAP : null;
}
