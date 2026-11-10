import type { ShelfPurgeOrder } from "../../shared/shelf-changes/domain/shelf-purge-batch.js";
import type { PublicShelfState } from "./ports/public-shelf-state.reader.js";
import type { ShelfSwitchAction } from "./ports/shop-shelf-switch.js";

/** Pourquoi une réponse publique n'est pas offerte à Workers Cache. */
export type PublicShelfRefusal = "disabled" | "version_moved" | "unavailable";

/** La décision, réponse par réponse. */
export type PublicShelfVerdict =
  { readonly cacheable: true } | { readonly cacheable: false; readonly reason: PublicShelfRefusal };

/**
 * **Une réponse publique se garde-t-elle ?** (`le-rayon-en-cache.md`,
 * § 3, « Le rayon douteux »). Seulement si le drapeau public est allumé aux
 * DEUX relevés et que la version n'a pas bougé entre eux : une purge passée
 * pendant le calcul a peut-être rendu ce rayon faux. Un relevé manquant
 * (magasin injoignable, lent, disjoncteur ouvert) ne se garde jamais.
 */
export function publicShelfVerdict(
  before: PublicShelfState | null,
  after: PublicShelfState | null,
): PublicShelfVerdict {
  if (before === null || after === null) {
    return { cacheable: false, reason: "unavailable" };
  }
  if (!before.enabled || !after.enabled) {
    return { cacheable: false, reason: "disabled" };
  }
  return before.version === after.version
    ? { cacheable: true }
    : { cacheable: false, reason: "version_moved" };
}

/**
 * **Une purge regroupée touche-t-elle le rayon public ?** « Tout » oui ; « ces
 * sociétés » non : le rayon public est calculé SANS société (lecteur
 * `PUBLIC_VIEWER` ou pro anonyme, `pricingCompanyOf` → `null`, aucun
 * détenteur de réservation), donc ni la mercuriale, ni une règle, ni le
 * statut, ni le suivi d'une société n'y entrent. Une réservation, qui le
 * change, purge « tout » (vérifié le 2026-11-04 dans `catalog-viewer.ts`,
 * `shop-catalogue-pricing.service.ts` et `shelf-change-scope.ts`).
 */
export function orderTouchesPublicShelf(order: ShelfPurgeOrder): boolean {
  return order.kind === "all";
}

/**
 * **Un geste de l'interrupteur purge-t-il Workers Cache ?** Éteindre (tout ou
 * le public seul) et vider : ce qui était gardé ne doit plus servir. Allumer
 * ne range rien d'avance, donc ne purge rien.
 */
export function switchPurgesPublicShelf(action: ShelfSwitchAction): boolean {
  return action === "off" || action === "public-off" || action === "purge";
}
