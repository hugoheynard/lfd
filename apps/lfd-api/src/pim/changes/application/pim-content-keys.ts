import type { ContentGuard } from "../../../platform/day-versions/versioned-contents.js";

/**
 * Ce qu'une clé de l'objet admet (`container/versioned-contents-store.ts`,
 * `CONTENT_KEY`, vérifié le 2026-11-12) : une clé refusée y ferait échouer
 * chaque rangement et ouvrirait le disjoncteur de tous les contenus.
 */
const ACCEPTED_KEY = /^[a-z0-9:-]{1,64}$/u;

/** Les clés opaques des contenus du référentiel dans l'objet. */
export const PIM_CONTENT_KEYS = {
  products: "pim-products",
  categories: "pim-categories",
  vatRates: "pim-vat-rates",
  salesContexts: "pim-sales-contexts",
  activeSalesContexts: "pim-sales-contexts-active",
  appellations: "pim-appellations",
  ingredients: "pim-ingredients",
} as const;

/** La clé d'une clé composée, ou `null` si l'objet ne l'admettrait pas. */
export function pimContentKey(...parts: readonly string[]): string | null {
  const key = parts.join("-");
  return ACCEPTED_KEY.test(key) ? key : null;
}

/**
 * La clé du détail d'une fiche, `pim-product:<id>` : l'onglet Cache regroupe
 * les contenus par le préfixe avant `:`. Une ligne par fiche dans l'objet,
 * remplacée à chaque rangement.
 */
export function productDetailKey(productId: string): string | null {
  const key = `pim-product:${productId}`;
  return /^pim-product:[a-z0-9-]+$/u.test(key) && ACCEPTED_KEY.test(key) ? key : null;
}

/** La clé du référentiel des allergènes, par portée et par langue. */
export function allergenReferenceKey(scope: string, locale: string): string | null {
  return pimContentKey("pim-allergens", scope, locale);
}

/**
 * Reconnaît une liste relue de l'objet. Contrôle de FORME seulement : la
 * charge a été rangée par la même révision du code (la révision est dans la
 * clé de l'objet) ; une forme inattendue est relue en base plutôt que servie.
 */
export function listContent<T>(): ContentGuard<T[]> {
  return (raw: unknown): raw is T[] => Array.isArray(raw);
}

/** Reconnaît un objet relu de l'objet, par les champs qu'il porte toujours. */
export function recordContent<T>(...fields: readonly string[]): ContentGuard<T> {
  return (raw: unknown): raw is T =>
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    fields.every((field) => Reflect.get(raw, field) !== undefined);
}
