import { ROOT_CONTEXT_KEY } from "../../../../sales-contexts/domain/value-objects/bootstrap-contexts.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { VariantSnapshot } from "../entities/variant.js";
import { servedAudiences, type Audience } from "../../../shared/domain/value-objects/audience.js";

/** Ce qui manque à une déclinaison pour se vendre — des clés, que l'écran traduit. */
export const PRICE_GAP = "price";
/**
 * ⚠️ La déclaration d'allergènes n'est plus un manque depuis le 2026-10-27
 * (`plan-allergenes-jamais-bloquants.md`) : une déclinaison sans déclaration
 * se sert par précaution (`effective-allergens.ts`, règle B). La clé
 * `allergens` ne vit plus que dans des manques publiés avant ; l'écran garde
 * son libellé pour les relire.
 */
/**
 * Le prix pro HT n'est pas saisi — seule source depuis le lot R3
 * (`plan-retirer-le-rapport-pro.md`, 2026-10-27).
 *
 * ⚠️ `pro_price_rule` (« rapport pro non réglé ») n'est plus calculé depuis le
 * même lot : la clé n'existe plus que dans des manques publiés avant, et
 * l'écran garde son libellé pour les relire.
 */
export const PRO_PRICE_GAP = "pro_price";
/**
 * Une déclinaison vendue au poids sans pas de saisie : personne ne saurait
 * quelle quantité proposer (`plan-vente-au-poids.md`, §2).
 */
export const WEIGHT_STEP_GAP = "weight_step";
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
  "priceCents" | "proPriceMillicents" | "saleUnit" | "weightStepGrams"
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
 * Le `b2b` toujours, même s'il était un jour mis hors service : le taux b2b
 * est celui de l'article sur le fil (`vatRatePercent`), qui dit comment
 * facturer ; on ne fabrique pas un taux que personne n'a décidé.
 *
 * ⚠️ Cette phrase justifiait le `b2b` par `catalog_items.price_millicents`
 * `NOT NULL` jusqu'au 2026-10-27 : la colonne est nullable depuis
 * (`plan-prix-manquant-non-bloquant.md`, P3 — vérifié ce jour-là), et le taux
 * reste exigé pour la raison ci-dessus, que ce plan ne touche pas.
 */
export function requiredContexts(rules: CompletenessRules): string[] {
  return [...new Set([ROOT_CONTEXT_KEY, ...rules.activeContextKeys])];
}

/** Une clientèle servie une par une — `both` n'en est pas une. */
export type ServedAudience = Exclude<Audience, "both">;

/**
 * **Les audiences visées par la fiche qui n'ont pas leur prix** — vide quand
 * chacune a le sien. Le prix d'une audience que la fiche ne vise pas n'est
 * jamais exigé (`plan-prix-manquant-non-bloquant.md`, §2, 2026-10-27).
 */
export function missingAudiencePrices(
  variant: CompletenessInput,
  audience: Audience,
): ServedAudience[] {
  return servedAudiences(audience).filter((served) =>
    served === "pro" ? variant.proPriceMillicents === null : variant.priceCents === null,
  );
}

/**
 * **La règle de complétude d'une déclinaison** — l'UNIQUE définition, que
 * l'activation (`activation-gaps.ts`) et les faits du catalogue
 * (`catalog-facts.ts`) appellent tous deux (lot 2b de
 * `plan-catalogue-synchronise-par-audience.md`).
 *
 * Complète = le prix d'**au moins une** des audiences visées (`audience`, la
 * clientèle EFFECTIVE de la fiche) et un taux pour chaque contexte requis.
 * Vide = complète. Une fiche « les deux » à qui manque un seul des deux prix
 * reste complète : elle se vend à l'audience dont elle a le prix, et le
 * constat `price_missing_for_audience` le signale (2026-10-27,
 * `plan-prix-manquant-non-bloquant.md`). Sans aucun prix visé, chaque prix
 * visé manquant est nommé (`price`, `pro_price`).
 *
 * Pure : le taux arrive résolu (famille, dérogation, registre), comme la
 * projection le résout. Une déclinaison arrêtée n'est pas jugée ici — c'est
 * à l'appelant de l'écarter : rien ne lui manque, elle ne se vend plus.
 */
export function variantGaps(
  variant: CompletenessInput,
  percents: CategoryVatPercents,
  rules: CompletenessRules,
  audience: Audience,
): string[] {
  const missing: string[] = [];
  const unpriced = missingAudiencePrices(variant, audience);
  if (unpriced.length === servedAudiences(audience).length) {
    // Dans l'ordre de l'écran : le prix public, puis le prix pro HT — dont la
    // saisie est la seule source (lot R3), dans la section « Tarif ».
    if (unpriced.includes("public")) {
      missing.push(PRICE_GAP);
    }
    if (unpriced.includes("pro")) {
      missing.push(PRO_PRICE_GAP);
    }
  }
  if (variant.saleUnit === "weight" && variant.weightStepGrams === null) {
    missing.push(WEIGHT_STEP_GAP);
  }
  for (const context of requiredContexts(rules)) {
    if (percents[context] === undefined) {
      missing.push(`${VAT_GAP_PREFIX}${context}`);
    }
  }
  return missing;
}
