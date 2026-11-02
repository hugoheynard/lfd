import { saleQuantity, type SaleUnit } from "@lfd/money";

import type { SameDayDoor } from "../../../order-cutoffs/domain/same-day-doors.js";
import type { OrderToPlace } from "../entities/order-shapes.js";
import { ShelfStockShortError } from "../errors/shelf-circuit-errors.js";
import type { SiteDaySettings } from "../ports/site-day-settings.reader.js";

/**
 * Les règles PURES du circuit du jour J à la passation (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §11.1,
 * §12 bloquant 3, lot L4) : un point qui sert encore aujourd'hui, et un reste
 * qui couvre le panier. Aucune lecture : l'appelant passe le site, l'heure et
 * le reste qu'il a lus.
 */

const MINUTES_PER_HOUR = 60;

/** Ce que la garde de créneau lit d'un site, déjà réduit à aujourd'hui. */
export type TodayPickupSite = Pick<SiteDaySettings, "proPickup" | "publicRules" | "publicClosures">;

/**
 * **Le point sert-il encore cette porte aujourd'hui, après `nowTime` ?**
 * (Q5 et §12 bloquant 3 — pas d'heure de fin à régler.)
 *
 * - particulier : un créneau public dont le début est après maintenant,
 *   qu'aucune fermeture n'entame — la règle même de la liste des créneaux
 *   que la boutique montre (`publicPickupSlotsFor`) ;
 * - pro en ligne : la fenêtre de retrait pro du site, pas encore finie ;
 * - comptoir : aucune garde — le client est devant le vendeur.
 *
 * Un site sans créneau ni fenêtre pour cette porte ne sert pas aujourd'hui :
 * jamais un horaire inventé.
 *
 * @param nowTime `HH:MM`, l'heure de Paris à l'horloge du serveur.
 */
export function pickupLeftToday(
  door: SameDayDoor,
  site: TodayPickupSite | null,
  nowTime: string,
): boolean {
  if (door === "counter") {
    return true;
  }
  if (site === null) {
    return false;
  }
  const now = minuteOf(nowTime);
  if (door === "pro_online") {
    return site.proPickup !== null && minuteOf(site.proPickup.end) > now;
  }
  return publicSlotStartsAfter(site, now);
}

function publicSlotStartsAfter(site: TodayPickupSite, now: number): boolean {
  const closures = site.publicClosures.map((closure) => ({
    from: closure.start === null ? 0 : minuteOf(closure.start),
    to: closure.end === null ? Number.POSITIVE_INFINITY : minuteOf(closure.end),
  }));
  return site.publicRules.some((rule) => {
    const end = minuteOf(rule.end);
    const step = rule.slotMinutes > 0 ? rule.slotMinutes : end - minuteOf(rule.start);
    for (let start = minuteOf(rule.start); step > 0 && start + step <= end; start += step) {
      const slotEnd = start + step;
      const closed = closures.some((span) => span.from < slotEnd && start < span.to);
      if (!closed && start > now) {
        return true;
      }
    }
    return false;
  });
}

function minuteOf(clock: string): number {
  const [hours = 0, minutes = 0] = clock.split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

/** Une ligne de la commande sur stock, telle que le reste la juge. */
export interface ShelfClaimLine {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: SaleUnit;
  /** Des pièces, ou des GRAMMES au poids (lot L2b-1). */
  readonly quantity: number;
}

/** Ce qu'une commande sur stock prend à UNE vitrine, ce jour-là. */
export interface ShelfClaim {
  readonly serviceDay: string;
  readonly siteId: string | null;
  readonly lines: readonly ShelfClaimLine[];
}

/**
 * La prise d'une commande composée, ou `null` si elle est fabriquée
 * (`planned`). Lue sur la forme persistée : c'est elle que le dépôt écrira,
 * et donc elle que les prélèvements reliront.
 */
export function shelfClaimOf(order: OrderToPlace): ShelfClaim | null {
  if (order.supply !== "shelf" || order.requestedDeliveryDate === null) {
    return null;
  }
  return {
    // `@db.Date` composé à minuit UTC : le jour se relit tel quel.
    serviceDay: order.requestedDeliveryDate.toISOString().slice(0, 10),
    siteId: order.pickupAddress?.siteId ?? null,
    lines: order.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      saleUnit: line.saleUnit,
      quantity: line.quantity,
    })),
  };
}

/** Ce qui reste d'un article en vitrine, dans UNE unité — la forme de `EstimatedStockLine`. */
export interface ShelfStockLeft {
  readonly sku: string;
  readonly saleUnit: SaleUnit;
  readonly estimatedStock: number;
}

/**
 * **Le reste couvre-t-il la commande ?** — sous le verrou du stock (§11.2).
 * Un article se compare dans SON unité : des grammes à des grammes (lot
 * L2b). Un article absent du stock du jour a un reste de zéro — c'est le
 * refus du panier mixte (§3). Deux lignes du même article s'additionnent.
 *
 * @throws {ShelfStockShortError} une ligne demande plus que ce qui reste.
 */
export function ensureShelfStockCovers(
  lines: readonly ShelfClaimLine[],
  stock: readonly ShelfStockLeft[],
): void {
  const asked = new Map<string, ShelfClaimLine>();
  for (const line of lines) {
    const key = `${line.saleUnit}:${line.sku}`;
    const known = asked.get(key);
    asked.set(key, { ...line, quantity: (known?.quantity ?? 0) + line.quantity });
  }
  for (const line of asked.values()) {
    const left =
      stock.find((entry) => entry.sku === line.sku && entry.saleUnit === line.saleUnit)
        ?.estimatedStock ?? 0;
    if (line.quantity > left) {
      throw new ShelfStockShortError(
        line.sku,
        line.productName,
        saleQuantity(Math.max(left, 0), line.saleUnit),
        saleQuantity(line.quantity, line.saleUnit),
      );
    }
  }
}
