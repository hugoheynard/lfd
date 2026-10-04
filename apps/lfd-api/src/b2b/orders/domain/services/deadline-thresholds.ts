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
}

/** Les deux réglages du commerce (§7.3), en minutes ; `null` = non réglée. */
export interface ProductionMargins {
  readonly deliveryMinutes: number | null;
  readonly pickupMinutes: number | null;
}

/**
 * - `deadline` : « avant `before` » ;
 * - `undated` : les commandes sans échéance, toujours le DERNIER seuil, signalé ;
 * - `day` : aucune marge réglée — un seul seuil, la journée (§7, comportement
 *   d'avant les vagues).
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
 * Les deux marges doivent être réglées pour qu'une heure soit calculée : avec
 * une seule, une moitié des commandes aurait une heure et l'autre non, et le
 * fournil lirait un compte à rebours faux sans pouvoir le savoir. Sans les
 * deux, un seul seuil `day` — ce que la journée était avant les vagues.
 *
 * Une échéance moins sa marge qui tombe avant minuit est ramenée à `00:00` :
 * rien ne part la veille (plan composition automatique, Q1).
 */
export function deadlineThresholds(
  orders: readonly DeadlineOrder[],
  margins: ProductionMargins,
): readonly SkuDeadlineThresholds[] {
  const { deliveryMinutes, pickupMinutes } = margins;
  const set =
    deliveryMinutes !== null && pickupMinutes !== null
      ? { delivery: deliveryMinutes, pickup: pickupMinutes }
      : null;
  const timed = set !== null;
  const bySku = new Map<string, { productName: string; byMinute: Map<number, number> }>();
  for (const order of orders) {
    const minute = set === null ? UNDATED : dueMinute(order, set);
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
      ...cumulate(entry.byMinute, timed),
    }));
}

/** La minute du jour avant laquelle sortir, ou `UNDATED`. */
function dueMinute(
  order: DeadlineOrder,
  margins: { readonly delivery: number; readonly pickup: number },
): number {
  if (order.window === null) {
    return UNDATED;
  }
  const margin = order.fulfillmentMethod === "delivery" ? margins.delivery : margins.pickup;
  return Math.max(0, minuteOf(dueClockOf(order.window)) - margin);
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

function cumulate(
  byMinute: ReadonlyMap<number, number>,
  timed: boolean,
): { readonly total: number; readonly thresholds: readonly DeadlineThreshold[] } {
  let cumulative = 0;
  const thresholds = [...byMinute.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minute, quantity]): DeadlineThreshold => {
      cumulative += quantity;
      if (minute !== UNDATED) {
        return { kind: "deadline", before: clockOf(minute), quantity, cumulative };
      }
      return { kind: timed ? "undated" : "day", before: null, quantity, cumulative };
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
