/**
 * D'où vient l'heure « prête pour » d'une commande du poste :
 *
 * - `round` : le départ de la tournée qui la livre ;
 * - `transfer` : le départ du transfert interne qui porte ce retrait au site ;
 * - `due` : l'échéance figée par le fournil (`dueAt`) — pour un retrait sur
 *   place, le début du créneau moins la mise en place au comptoir.
 */
export type ReadyBySource = "round" | "transfer" | "due";

/** Un départ connu de la livraison, lu à l'heure de Paris. */
export interface LocalDeparture {
  /** `AAAA-MM-JJ` du départ. */
  readonly day: string;
  /** `HH:mm`. */
  readonly time: string;
  readonly via: "delivery" | "transfer";
}

/** L'heure à laquelle la commande doit être prête, et sa source ; `null` : aucune connue. */
export interface ReadyBy {
  readonly time: string | null;
  readonly source: ReadyBySource | null;
}

const UNKNOWN: ReadyBy = { time: null, source: null };

/**
 * **À quelle heure cette commande doit-elle être prête ?** (lot L2,
 * `commandes/plan-tri-depart-et-couleurs.md` §3 ; Hugo, 2026-10-14).
 *
 * - une **livraison** part avec sa tournée : l'heure est le départ de la
 *   tournée, jamais la fenêtre du client. Pas encore de tournée, ou une tournée
 *   sans départ prévu : aucune heure — « pas encore de départ », rangée en fin ;
 * - un **retrait porté par un transfert** part avec le transfert ; tant que le
 *   transfert n'a pas de départ, l'échéance figée par le fournil (l'arrivée
 *   requise au site) tient lieu d'heure ;
 * - un **retrait sur place** : l'échéance figée par le fournil, qui est déjà
 *   le début du créneau moins la mise en place au comptoir du site.
 *
 * Aucune marge de chargement n'est retirée au départ : il n'en existe pas
 * dans les réglages de la livraison (relu le 2026-10-14 :
 * `RoutingSettingsValues` n'en porte aucune).
 *
 * Un départ lu un AUTRE jour que celui du poste (commande rapportée et
 * replacée) n'est pas une heure de ce jour : il est ignoré.
 */
export function readyByOf(
  order: { readonly fulfillmentMethod: "pickup" | "delivery"; readonly dueAt: string | null },
  departure: LocalDeparture | undefined,
  serviceDay: string,
): ReadyBy {
  const sameDay = departure !== undefined && departure.day === serviceDay ? departure : undefined;
  if (sameDay !== undefined) {
    return { time: sameDay.time, source: sameDay.via === "delivery" ? "round" : "transfer" };
  }
  if (order.fulfillmentMethod === "delivery") {
    return UNKNOWN;
  }
  return order.dueAt === null ? UNKNOWN : { time: order.dueAt, source: "due" };
}

/** `HH:mm` se compare en texte ; sans heure vient après. */
export function compareReadyBy(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left < right ? -1 : 1;
}
