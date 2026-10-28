/**
 * **Le compte à rebours du fournil** — pour chaque SKU d'une journée, ce qui
 * doit être sorti avant chaque heure, cumulé (plan production par vagues,
 * §7.2 : « l'échéance mène »).
 *
 * Fonction pure : ni horloge, ni base. Le commerce la calcule parce que lui
 * seul connaît l'échéance d'une commande et ses marges ; la production ne
 * reçoit que le résultat (§7 : la production ne parle jamais à la livraison).
 *
 * ## Quelle heure est l'échéance — tranché par Hugo le 2026-10-04 (plan, §7.4)
 *
 * Le **début** de la fenêtre s'il y en a un, sinon sa **fin**. Un créneau
 * « 06:00–08:00 » se tient dès 06:00 : un client peut venir retirer à
 * l'ouverture du créneau, et une tournée peut arriver à son début — la
 * marchandise doit donc être là au plus tôt de la fenêtre, pas au plus tard.
 * En mode échéance (CA-D2), il n'y a pas de début, et la fin est l'heure
 * limite. C'est la règle du §2 pour le retrait, appliquée aussi à la livraison :
 * une seule règle, et produire trop tard serait le seul vrai défaut.
 *
 * Une fenêtre recopiée par défaut (heures d'ouverture, `source: "default"`)
 * compte comme une autre : elle n'est pas une promesse, mais c'est l'heure à
 * laquelle le client peut se présenter.
 */

/** Une ligne de commande, ce que le fournil en fabrique. */
export interface DeadlineLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Une commande du jour, réduite à ce qui fixe son échéance. */
export interface DeadlineOrder {
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** `HH:mm` ; `null` = aucune fenêtre convenue (ancienne commande, retrait sans créneau). */
  readonly window: { readonly start: string | null; readonly end: string } | null;
  readonly lines: readonly DeadlineLine[];
  /**
   * Le site qui remet un retrait (plan des sites, §4.6, lot T0). Absent = site
   * non résolu, et l'échéance reste celle d'avant les sites : fenêtre − marge
   * de retrait. Ignoré pour une livraison.
   */
  readonly site?: DeadlineSite;
}

/**
 * - `on_site` : le site colise sur place ; sa mise en place au comptoir
 *   s'AJOUTE à la marge de retrait ;
 * - `transfer` : la marchandise arrive par un transfert interne ; l'échéance
 *   est son départ requis (`transferDeparture`) moins la marge de LIVRAISON
 *   (colisage + chargement). `null` = départ incalculable → `UNDATED`.
 */
export type DeadlineSite =
  | { readonly supply: "on_site"; readonly counterSetupMinutes: number }
  | {
      readonly supply: "transfer";
      /** Le départ requis du transfert, `HH:mm` ; `null` = incalculable. */
      readonly requiredBy: string | null;
      /** L'arrivée requise au site, `HH:mm` ; `null` = incalculable. */
      readonly arrivalBy: string | null;
    };

/** Les deux réglages du commerce (§7.3), en minutes ; `null` = non réglée. */
export interface ProductionMargins {
  readonly deliveryMinutes: number | null;
  readonly pickupMinutes: number | null;
}

/**
 * - `deadline` : « avant `before` » ;
 * - `undated` : les commandes sans échéance, toujours le DERNIER seuil, signalé ;
 * - `day` : un seul seuil, la journée. Le commerce ne le rend plus depuis que
 *   la marge absente compte pour zéro (2026-10-28) ; la production le garde
 *   pour les tranches fixes sans heure réglée.
 */
export type DeadlineThresholdKind = "deadline" | "undated" | "day";

export interface DeadlineThreshold {
  readonly kind: DeadlineThresholdKind;
  /** `HH:mm`, seulement pour `deadline`. */
  readonly before: string | null;
  /** Ce que ce seuil ajoute au précédent. */
  readonly quantity: number;
  /** Ce qui doit être sorti avant ce seuil, tout compris. */
  readonly cumulative: number;
}

export interface SkuDeadlineThresholds {
  readonly sku: string;
  readonly productName: string;
  readonly total: number;
  /** Triés par heure croissante ; `undated` en dernier. */
  readonly thresholds: readonly DeadlineThreshold[];
}

const MINUTES_PER_HOUR = 60;
/** Clé de tri des commandes sans échéance : après toute heure du jour. */
const UNDATED = Number.POSITIVE_INFINITY;

/**
 * Les seuils cumulés de chaque SKU, triés par SKU.
 *
 * Une marge non réglée compte pour **zéro minute** (Hugo, 2026-10-28 : « mets
 * la marge à zéro si pas réglée ») : l'heure « prêt avant » est alors
 * l'échéance elle-même. Jusque-là, il fallait les deux marges, et sans elles
 * tout tombait en un seul seuil `day` — les tranches fixes réglées n'avaient
 * rien à découper.
 *
 * Une échéance moins sa marge qui tombe avant minuit est ramenée à `00:00` :
 * rien ne part la veille (plan composition automatique, Q1).
 */
export function deadlineThresholds(
  orders: readonly DeadlineOrder[],
  margins: ProductionMargins,
): readonly SkuDeadlineThresholds[] {
  const { deliveryMinutes, pickupMinutes } = margins;
  const set = { delivery: deliveryMinutes ?? 0, pickup: pickupMinutes ?? 0 };
  const bySku = new Map<string, { productName: string; byMinute: Map<number, number> }>();
  for (const order of orders) {
    const minute = dueMinute(order, set);
    for (const line of order.lines) {
      const entry = bySku.get(line.sku) ?? {
        productName: line.productName,
        byMinute: new Map<number, number>(),
      };
      entry.byMinute.set(minute, (entry.byMinute.get(minute) ?? 0) + line.quantity);
      bySku.set(line.sku, entry);
    }
  }
  return [...bySku.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([sku, entry]) => ({
      sku,
      productName: entry.productName,
      ...cumulate(entry.byMinute),
    }));
}

/** La minute du jour avant laquelle sortir, ou `UNDATED`. */
function dueMinute(
  order: DeadlineOrder,
  margins: { readonly delivery: number; readonly pickup: number },
): number {
  if (order.fulfillmentMethod === "delivery") {
    return order.window === null
      ? UNDATED
      : Math.max(0, minuteOf(dueClockOf(order.window)) - margins.delivery);
  }
  const site = order.site;
  if (site?.supply === "transfer") {
    // Le transfert part pour le site, pas pour le client : sa fenêtre ne compte plus.
    return site.requiredBy === null
      ? UNDATED
      : Math.max(0, minuteOf(site.requiredBy) - margins.delivery);
  }
  if (order.window === null) {
    return UNDATED;
  }
  const setup = site?.counterSetupMinutes ?? 0;
  return Math.max(0, minuteOf(dueClockOf(order.window)) - margins.pickup - setup);
}

/**
 * **L'heure d'échéance d'une fenêtre**, `HH:mm` : son début s'il y en a un,
 * sinon sa fin — la règle de l'en-tête. Exportée pour que le snapshot remis au
 * fournil (`ProducibleOrder.dueAt`, colisage §13) suive la MÊME règle que le
 * compte à rebours, sans la recopier.
 */
export function dueClockOf(window: NonNullable<DeadlineOrder["window"]>): string {
  return window.start ?? window.end;
}

/**
 * **L'heure à laquelle la marchandise doit être À DESTINATION** — le snapshot
 * remis au colisage (`ProducibleOrder.dueAt`), règle décidée le 2026-10-13
 * (plan du transfert interne, état de T0) :
 *
 * - livraison : la fenêtre chez le client, inchangée ;
 * - retrait sur un site sur place : la fenêtre moins la mise en place au
 *   comptoir (ramenée à `00:00` au plus tôt) ;
 * - retrait sur un site servi par transfert : l'arrivée requise au site, et
 *   non plus la fenêtre du client — le transfert part pour le site ;
 * - retrait au site non résolu (commande d'avant S2) : la fenêtre, comme avant.
 *
 * Aucune marge ici : les marges sont celles du fournil (`deadlineThresholds`),
 * le colisage range par l'heure d'arrivée.
 */
export function destinationDueAt(order: DeadlineOrder): string | null {
  const site = order.fulfillmentMethod === "pickup" ? order.site : undefined;
  if (site?.supply === "transfer") {
    return site.arrivalBy;
  }
  if (order.window === null) {
    return null;
  }
  const clock = dueClockOf(order.window);
  const setup = site?.counterSetupMinutes ?? 0;
  return setup === 0 ? clock : clockOf(Math.max(0, minuteOf(clock) - setup));
}

function cumulate(byMinute: ReadonlyMap<number, number>): {
  readonly total: number;
  readonly thresholds: readonly DeadlineThreshold[];
} {
  let cumulative = 0;
  const thresholds = [...byMinute.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minute, quantity]): DeadlineThreshold => {
      cumulative += quantity;
      if (minute !== UNDATED) {
        return { kind: "deadline", before: clockOf(minute), quantity, cumulative };
      }
      return { kind: "undated", before: null, quantity, cumulative };
    });
  return { total: cumulative, thresholds };
}

function minuteOf(clock: string): number {
  const [hours = 0, minutes = 0] = clock.split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

function clockOf(minute: number): string {
  const hours = Math.floor(minute / MINUTES_PER_HOUR);
  const minutes = minute % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
