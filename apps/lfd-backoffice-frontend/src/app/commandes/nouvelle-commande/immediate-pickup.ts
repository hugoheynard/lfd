import type {
  CatalogItemView,
  OrderSaleUnit,
  PickupSlot,
  ResupplyReceiptLineView,
} from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

/**
 * **Le « Retrait immédiat » du comptoir** (plan du jour J, lot L6) — un
 * raccourci, pas un type de commande : retrait, aujourd'hui, au point du
 * comptoir, créneau en cours, prise sur le stock de la vitrine
 * (`supply: "shelf"`, `entryShortcut: "immediate_pickup"`). Ces fonctions
 * pures en dérivent ce que l'écran pré-règle.
 */

/** La nature de la saisie : tout de suite au comptoir, ou pour une date. */
export type OrderEntryKind = 'immediate' | 'scheduled';

/** `AAAA-MM-JJ` local. */
export function isoDayOf(instant: Date): string {
  const month = `${instant.getMonth() + 1}`.padStart(2, '0');
  const day = `${instant.getDate()}`.padStart(2, '0');
  return `${instant.getFullYear()}-${month}-${day}`;
}

/** `HH:mm` local. */
export function clockOf(instant: Date): string {
  return `${`${instant.getHours()}`.padStart(2, '0')}:${`${instant.getMinutes()}`.padStart(2, '0')}`;
}

/**
 * Le créneau **en cours** du point : celui qui contient `now` ; à défaut le
 * prochain ; à défaut (après la fermeture) le dernier — le client est devant
 * le comptoir, et le serveur ne juge aucun créneau au comptoir (bâti de L4).
 * `null` seulement quand le point n'a déclaré aucune heure.
 */
export function currentSlotOf(slots: readonly PickupSlot[], now: string): PickupSlot | null {
  const running = slots.find((slot) => (slot.start ?? '') <= now && now < slot.end);
  return running ?? slots.find((slot) => now < slot.end) ?? slots.at(-1) ?? null;
}

/** L'unité d'un article au catalogue — `piece` quand il ne la dit pas. */
function unitOf(item: Pick<CatalogItemView, 'saleUnit'>): OrderSaleUnit {
  return item.saleUnit ?? 'piece';
}

/**
 * Le reste du jour par SKU, dans l'unité où l'article SE VEND aujourd'hui
 * (grammes au poids) : une ligne de stock d'une autre unité ne compte pas.
 * Seuls les restes positifs y entrent.
 */
export function shelfStockBySku(
  stock: readonly ResupplyReceiptLineView[],
  catalogue: readonly Pick<CatalogItemView, 'sku' | 'saleUnit'>[],
): ReadonlyMap<string, number> {
  const units = new Map(catalogue.map((item) => [item.sku, unitOf(item)] as const));
  const left = new Map<string, number>();
  for (const line of stock) {
    if (line.estimatedStock > 0 && units.get(line.sku) === line.saleUnit) {
      left.set(line.sku, line.estimatedStock);
    }
  }
  return left;
}

/** « reste 3 », « reste 1,25 kg ». */
export function shelfHintOf(quantity: number, unit: OrderSaleUnit): string {
  return `reste ${unit === 'weight' ? saleQuantityLabel(quantity, 'weight') : quantity}`;
}

/**
 * Ce que le panier demande au-delà du reste, dit en clair — `null` quand tout
 * tient. Le serveur rejuge sous verrou (`orders.shelf.stock_short`) ; l'écran
 * le dit seulement avant l'envoi.
 */
export function shelfShortageOf(
  lines: readonly { readonly sku: string; readonly name: string; readonly quantity: number }[],
  left: ReadonlyMap<string, number>,
): string | null {
  const short = lines.filter((line) => line.quantity > (left.get(line.sku) ?? 0));
  if (short.length === 0) {
    return null;
  }
  return `Pas assez en vitrine pour : ${short.map((line) => line.name).join(', ')}.`;
}
