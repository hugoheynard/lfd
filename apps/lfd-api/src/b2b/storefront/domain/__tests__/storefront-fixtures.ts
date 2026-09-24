import type { ObjectSettingsInput } from "../object-settings.js";
import type { StorefrontObjectInput } from "../storefront-object.js";

/**
 * Les briques des specs de la vitrine : des réglages et des objets VALIDES par
 * défaut, qu'un test déforme d'un seul champ pour éprouver un seul refus.
 */

export const CAROUSEL = {
  nav: "dots",
  autoplay: false,
  intervalSeconds: 5,
  firstSeconds: 8,
  sampleCount: 3,
} as const;

export function settings(overrides: Partial<ObjectSettingsInput> = {}): ObjectSettingsInput {
  return {
    shape: "card",
    applyOnMobile: true,
    mediaFit: "cover",
    mediaSide: "top",
    multiple: false,
    carousel: CAROUSEL,
    tone: "light",
    ...overrides,
  };
}

/** Un objet posé : forme, place, rayons ; les réglages suivent la forme (côté par défaut). */
export function object(
  id: string,
  shape: string,
  [column, row]: readonly [number, number],
  shelves: readonly string[] = ["all"],
  overrides: Partial<StorefrontObjectInput> = {},
): StorefrontObjectInput {
  const side = shape === "card" || shape === "kakemono" ? "top" : "left";
  return {
    id,
    settings: settings({ shape, mediaSide: side }),
    column,
    row,
    shelves,
    contents: [],
    ...overrides,
  };
}
