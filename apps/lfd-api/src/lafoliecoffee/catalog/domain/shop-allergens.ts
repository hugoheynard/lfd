import type { ContentLocale, ShopItemAllergensView } from "@lfd/contracts";

import { CATALOG_SOURCE_LANGUAGE } from "./catalog-translations.js";

/** Les libellés d'UNE langue, tels que le référentiel les a nommés. */
export interface AllergenTexts {
  readonly contains: readonly string[];
  readonly mayContain: readonly string[];
}

/** Langue (`fr`, `en`, `it`) → libellés. Une carte : une langue ouverte au référentiel est une donnée. */
export type AllergenTextsByLanguage = Readonly<Record<string, AllergenTexts>>;

/**
 * Ce qu'un article reçu sait de ses allergènes, ce que la vitrine en tire.
 *
 * `codes` et `incomplete` décident de l'ÉTAT ; `texts` porte ce qui se lit.
 */
export interface ShopAllergenFacts {
  /** Les codes servis — `null` = aucune fiche (un article d'avant la règle B). */
  readonly codes: readonly string[] | null;
  /** Un code servi que le référentiel ne sait pas nommer : la liste est amputée. */
  readonly incomplete: boolean;
  /** Servi par précaution (règle B de `plan-allergenes-jamais-bloquants.md`). */
  readonly precautionary: boolean;
  /** `null` = reçu avant que le fil porte les libellés (2026-10-27). */
  readonly texts: AllergenTextsByLanguage | null;
}

/**
 * **Ce que la vitrine dit des allergènes, dans une langue** — ou rien, quand
 * elle ne sait pas (`documentation/pim/plan-allergenes-en-boutique.md`).
 *
 * Rien (`null`) plutôt qu'un état deviné, dans trois cas : pas de libellés
 * reçus, pas de fiche, liste amputée d'un code innommable. Les trois se
 * liraient sinon « aucun allergène » ou une liste complète — l'affirmation
 * positive à la place du silence, la seule faute qui compte sur ce champ.
 *
 * Une langue absente des libellés retombe sur le français, comme les noms.
 */
export function shopAllergensOf(
  facts: ShopAllergenFacts,
  language: ContentLocale,
): ShopItemAllergensView | null {
  const texts = facts.texts?.[language] ?? facts.texts?.[CATALOG_SOURCE_LANGUAGE];
  if (texts === undefined || facts.incomplete) {
    return null;
  }
  const lists = { contains: [...texts.contains], mayContain: [...texts.mayContain] };
  if (facts.precautionary) {
    return { state: "precautionary", ...lists };
  }
  if (facts.codes === null) {
    return null;
  }
  if (facts.codes.length === 0) {
    return { state: "none", ...lists, contains: [] };
  }
  // Des codes et aucun libellé : rien à montrer qui ne mentirait pas.
  return texts.contains.length === 0 ? null : { state: "declared", ...lists };
}
