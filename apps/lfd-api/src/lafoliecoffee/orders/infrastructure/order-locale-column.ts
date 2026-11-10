import type { ContentLocale } from "@lfd/contracts";

import { OrderLocale } from "../domain/value-objects/order-locale.js";

/**
 * La colonne `orders.locale` relue : `null` reste `null` (commande sans
 * langue) ; une valeur hors des langues de la boutique est refusée par le
 * value object, jamais ramenée en silence au français.
 */
export function orderLocaleOf(value: string | null): ContentLocale | null {
  return value === null ? null : OrderLocale.of(value).code;
}
