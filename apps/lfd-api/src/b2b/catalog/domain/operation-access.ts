import { addDays, localToInstant } from "@lfd/contracts";

import type { PickupDayRange } from "./operation-days.js";
import { OperationDayEndMissingError } from "./errors/catalog-operation-errors.js";
import type { ShopAudience } from "./ports/catalog.reader.js";
import type { SellableOperation } from "./ports/catalog-operations.reader.js";

/**
 * Pourquoi un article `operationOnly`, montré, ne se commande pas **là** :
 *
 * - `not_yet_open` — la commande n'est pas encore ouverte ;
 * - `closed` — elle est close ;
 * - `day_outside` — le jour demandé tombe hors des jours de retrait ;
 * - `no_day` — aucun jour n'est demandé, et l'opération en exige un (D6).
 */
export type OperationClosedReason = "not_yet_open" | "closed" | "day_outside" | "no_day";

/** Montré, mais pas commandable — avec l'opération qui le dit, pour le message (D6). */
export interface OperationClosed {
  readonly status: "closed";
  readonly reason: OperationClosedReason;
  readonly operation: SellableOperation;
}

/**
 * **Vendable maintenant ?** (D4 de `documentation/order/architecture-operations-datees.md`)
 *
 * - `free` — l'article n'est pas `operationOnly` : les opérations ne le
 *   contraignent jamais (D3 — le croissant du 26 décembre) ;
 * - `shown` — une opération le montre et la commande y est ouverte, la
 *   question ne portant sur aucun jour (la vitrine) ;
 * - `orderable` — ouverte, ET le jour demandé est un jour de retrait ;
 * - {@link OperationClosed} — montré, mais pas commandable ;
 * - `absent` — aucune opération ne le montre à cette clientèle : ni rayon, ni
 *   fiche, ni panier. Jamais « libre ».
 */
export type OperationAccess = "free" | "shown" | "orderable" | "absent" | OperationClosed;

/** Ce que la fonction lit d'un article : son SKU **du catalogue** (la déclinaison) et son drapeau. */
export interface OperationAccessItem {
  readonly sku: string;
  readonly operationOnly: boolean;
}

/** Ce que chaque clientèle d'opération atteint. `both` n'est pas une troisième population. */
const REACHES: Readonly<Record<SellableOperation["audience"], readonly ShopAudience[]>> = {
  pro: ["pro"],
  public: ["public"],
  both: ["pro", "public"],
};

/**
 * Du meilleur au pire : la réponse d'un article montré par PLUSIEURS
 * opérations est la meilleure d'entre elles (D3 — la galette, deux week-ends).
 * Un jour mal choisi vaut mieux qu'une commande close : il se corrige.
 */
const RANK: Readonly<Record<"orderable" | "shown" | OperationClosedReason, number>> = {
  orderable: 5,
  shown: 4,
  day_outside: 3,
  no_day: 3,
  not_yet_open: 2,
  closed: 1,
};

/**
 * La réponse de D4. Pure : ni base, ni horloge — `now` est l'instant de la
 * requête, lu par l'appelant sur le `Clock`.
 *
 * @param fulfillmentDate le jour de retrait `AAAA-MM-JJ` demandé.
 *   **Absent** (`undefined`) = la question ne porte sur aucun jour — la
 *   vitrine, le devis — et la réponse s'arrête à `shown`. **`null`** = une
 *   commande qui n'en porte pas : pour un article `operationOnly`, c'est un
 *   refus (`no_day`, D6).
 * @throws {OperationDayEndMissingError} minuit n'existe pas le lendemain du
 *   dernier jour de retrait (impossible tant que les bascules tombent la nuit).
 */
export function operationAccess(
  item: OperationAccessItem,
  operations: readonly SellableOperation[],
  audience: ShopAudience,
  now: Date,
  fulfillmentDate?: string | null,
): OperationAccess {
  if (!item.operationOnly) {
    return "free";
  }
  let best: OperationAccess = "absent";
  for (const operation of operations) {
    if (!showsTo(operation, item.sku, audience, now)) {
      continue;
    }
    const access = accessWithin(operation, now, fulfillmentDate);
    if (best === "absent" || isBetter(access, best)) {
      best = access;
    }
  }
  return best;
}

/**
 * Les jours de retrait qu'un article `operationOnly` peut encore demander :
 * les plages des opérations qui le montrent à cette clientèle ET dont la
 * commande est ouverte maintenant. `null` = l'article n'est pas
 * `operationOnly`, aucun jour ne lui est imposé. Une liste vide = aucun jour.
 */
export function orderablePickupRanges(
  item: OperationAccessItem,
  operations: readonly SellableOperation[],
  audience: ShopAudience,
  now: Date,
): PickupDayRange[] | null {
  if (!item.operationOnly) {
    return null;
  }
  return operations
    .filter(
      (operation) =>
        showsTo(operation, item.sku, audience, now) &&
        accessWithin(operation, now, undefined) === "shown",
    )
    .map((operation) => ({ from: operation.pickupFrom, until: operation.pickupUntil }));
}

/**
 * L'état d'une opération **montrée**, à cet instant : annoncée, ouverte, ou
 * close. Rend `null` hors de sa fenêtre de visibilité — en préparation, ou
 * terminée.
 */
export function operationStateAt(
  operation: SellableOperation,
  now: Date,
): "announced" | "open" | "closed" | null {
  if (!isVisibleAt(operation, now)) {
    return null;
  }
  if (now.getTime() < opensAt(operation).getTime()) {
    return "announced";
  }
  return now.getTime() < operation.orderUntil.getTime() ? "open" : "closed";
}

/** L'opération s'adresse-t-elle à cette clientèle ? */
export function reachesAudience(operation: SellableOperation, audience: ShopAudience): boolean {
  return REACHES[operation.audience].includes(audience);
}

/** L'instant où la commande ouvre : `orderFrom`, ou l'annonce quand il n'y en a pas (D2). */
export function opensAt(operation: SellableOperation): Date {
  return operation.orderFrom ?? operation.announceFrom;
}

/**
 * `fin(jour)` de D2 : minuit, heure de Paris, le lendemain. La seule
 * traduction d'un jour en instant — jamais un `T00:00Z` (`lint:business-day`).
 *
 * @throws {OperationDayEndMissingError} minuit n'existe pas ce lendemain-là.
 */
export function endOfDay(day: string): Date {
  const next = addDays(day, 1);
  const instant = localToInstant(next, "00:00");
  if (instant === null) {
    throw new OperationDayEndMissingError(next);
  }
  return instant;
}

/** Fenêtre de visibilité : de l'annonce au lendemain du dernier jour de retrait, exclu. */
function isVisibleAt(operation: SellableOperation, now: Date): boolean {
  return (
    operation.announceFrom.getTime() <= now.getTime() &&
    now.getTime() < endOfDay(operation.pickupUntil).getTime()
  );
}

function showsTo(
  operation: SellableOperation,
  sku: string,
  audience: ShopAudience,
  now: Date,
): boolean {
  return (
    reachesAudience(operation, audience) &&
    operation.skus.includes(sku) &&
    isVisibleAt(operation, now)
  );
}

function accessWithin(
  operation: SellableOperation,
  now: Date,
  fulfillmentDate: string | null | undefined,
): OperationAccess {
  if (now.getTime() < opensAt(operation).getTime()) {
    return { status: "closed", reason: "not_yet_open", operation };
  }
  if (now.getTime() >= operation.orderUntil.getTime()) {
    return { status: "closed", reason: "closed", operation };
  }
  if (fulfillmentDate === undefined) {
    return "shown";
  }
  if (fulfillmentDate === null) {
    return { status: "closed", reason: "no_day", operation };
  }
  // L'ordre ISO des jours `AAAA-MM-JJ` est celui du calendrier.
  if (fulfillmentDate < operation.pickupFrom || fulfillmentDate > operation.pickupUntil) {
    return { status: "closed", reason: "day_outside", operation };
  }
  return "orderable";
}

function rankOf(access: OperationAccess): number {
  if (typeof access === "string") {
    return access === "orderable" || access === "shown" ? RANK[access] : 0;
  }
  return RANK[access.reason];
}

/**
 * À rang égal, deux départages qui choisissent le message le plus utile : la
 * commande qui ouvre le plus tôt, la clôture la plus récente. Sinon, la
 * première dans l'ordre du lecteur (l'annonce la plus récente).
 */
function isBetter(candidate: OperationAccess, current: OperationAccess): boolean {
  const byRank = rankOf(candidate) - rankOf(current);
  if (byRank !== 0 || typeof candidate === "string" || typeof current === "string") {
    return byRank > 0;
  }
  if (candidate.reason === "not_yet_open" && current.reason === "not_yet_open") {
    return opensAt(candidate.operation).getTime() < opensAt(current.operation).getTime();
  }
  if (candidate.reason === "closed" && current.reason === "closed") {
    return candidate.operation.orderUntil.getTime() > current.operation.orderUntil.getTime();
  }
  return false;
}
