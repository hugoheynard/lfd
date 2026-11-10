import { saleQuantity, type SaleUnit } from "@lfd/money";

import type { SameDayDoor } from "../../../order-cutoffs/domain/same-day-doors.js";
import type { RevisableOrder } from "../../revision/domain/entities/order-revision.js";
import type { OrderToPlace } from "../entities/order-shapes.js";
import { ShelfStockShortError } from "../errors/shelf-circuit-errors.js";
import type { SiteDaySettings } from "../ports/site-day-settings.reader.js";

/**
 * Les règles PURES du circuit du jour J à la passation (plan
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`,
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
 * Ce que la prise lit d'une commande composée — sa forme persistée, ou
 * l'agrégat lui-même avant que son règlement soit décidé (estimation, lot P2).
 */
export type ShelfClaimSource = Pick<
  OrderToPlace,
  "supply" | "requestedDeliveryDate" | "pickupAddress"
> & { readonly lines: readonly ShelfClaimLine[] };

/**
 * La prise d'une commande composée, ou `null` si elle est fabriquée
 * (`planned`). Lue sur la forme persistée : c'est elle que le dépôt écrira,
 * et donc elle que les prélèvements reliront.
 */
export function shelfClaimOf(order: ShelfClaimSource): ShelfClaim | null {
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

/**
 * La prise d'une commande sur stock DÉJÀ PASSÉE, telle que la révision la
 * trouve — `null` si elle est fabriquée. Sa journée et son point sont figés
 * (`ensureShelfKeepsRoute`) : c'est la vitrine que la révision rejuge.
 */
export function revisedShelfClaimOf(order: RevisableOrder): ShelfClaim | null {
  if (order.supply !== "shelf" || order.serviceDay === null) {
    return null;
  }
  return {
    serviceDay: order.serviceDay,
    siteId: order.fulfillment.pickupAddress?.siteId ?? null,
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
  const short = shelfStockShortfallOf(lines, stock);
  if (short !== null) {
    throw short;
  }
}

/**
 * Le même jugement, sans le lever : le premier manque, ou `null`. Partagé
 * par la passation (sous verrou, {@link ensureShelfStockCovers}) et par
 * l'estimation de la saisie, qui le dit sans verrou (lot P2).
 */
export function shelfStockShortfallOf(
  lines: readonly ShelfClaimLine[],
  stock: readonly ShelfStockLeft[],
): ShelfStockShortError | null {
  for (const line of totalsOf(lines).values()) {
    const left =
      stock.find((entry) => entry.sku === line.sku && entry.saleUnit === line.saleUnit)
        ?.estimatedStock ?? 0;
    if (line.quantity > left) {
      return new ShelfStockShortError(
        line.sku,
        line.productName,
        saleQuantity(Math.max(left, 0), line.saleUnit),
        saleQuantity(line.quantity, line.saleUnit),
      );
    }
  }
  return null;
}

/**
 * **Le reste couvre-t-il la révision ?** (plan du jour J, §12 bloquant 2,
 * §13, lot L5) — sous le verrou du stock, comme la passation.
 *
 * Le reste lu compte DÉJÀ la commande révisée parmi les prélèvements : elle
 * est vivante. La rendre d'abord, puis reprendre la nouvelle composition,
 * revient à ne juger que les HAUSSES, par article et par unité : une hausse
 * doit tenir dans le reste, une baisse ou un article retiré rend le stock et
 * ne se refuse jamais. Le refus d'une hausse nomme la quantité AJOUTÉE.
 *
 * @throws {ShelfStockShortError} une hausse dépasse ce qui reste.
 */
export function ensureShelfRevisionCovered(
  before: readonly ShelfClaimLine[],
  after: readonly ShelfClaimLine[],
  stock: readonly ShelfStockLeft[],
): void {
  const held = totalsOf(before);
  const increases: ShelfClaimLine[] = [];
  for (const [key, line] of totalsOf(after)) {
    const added = line.quantity - (held.get(key)?.quantity ?? 0);
    if (added > 0) {
      increases.push({ ...line, quantity: added });
    }
  }
  ensureShelfStockCovers(increases, stock);
}

/** Les lignes additionnées par article et par unité — jamais pièces et grammes ensemble. */
function totalsOf(lines: readonly ShelfClaimLine[]): ReadonlyMap<string, ShelfClaimLine> {
  const totals = new Map<string, ShelfClaimLine>();
  for (const line of lines) {
    const key = `${line.saleUnit}:${line.sku}`;
    const known = totals.get(key);
    totals.set(key, { ...line, quantity: (known?.quantity ?? 0) + line.quantity });
  }
  return totals;
}
