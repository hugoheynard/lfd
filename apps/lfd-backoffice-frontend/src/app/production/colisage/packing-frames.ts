import type { DeliveryPackingRoundView, PackingSheet, SitePaletteEntryView } from '@lfd/contracts';

import {
  logisticsCategoryOf,
  type TransferNaming,
  transferColorOf,
} from '../../shared/logistics-colors/logistics-category';
import { type PackingEntry, packingGroups } from './packing-rounds';

/**
 * **La liste du colisage, la plus urgente en haut** (Hugo, 2026-10-25 — revoit
 * les cadres par catégorie du 2026-10-13 et du 2026-10-14, plan
 * `commandes/back-office/tri-depart-et-couleurs.md`, L1b puis L2).
 *
 * « La couleur suffit en barre à gauche, c'est plus important de les classer
 * la plus urgente en haut que de les grouper par type » : UNE liste, chaque
 * commande avec la couleur de sa catégorie logistique (celle de la palette des
 * sites, inchangée) en barre à gauche. Seule exception, voulue : **un site servi
 * par transfert garde son encadré** — ses retraits partent ensemble, et c'est
 * l'encadré qui se range, à l'heure de sa commande la plus urgente.
 *
 * **L'urgence est l'heure « prête pour »** servie par le colisage (`readyBy`,
 * repli sur `dueAt` pour une fiche qui ne la porte pas — {@link deadlineOf}) ;
 * sans heure en dernier. À égalité, l'ordre servi (tri stable : dans une
 * tournée, l'ordre de chargement).
 *
 * Fonction pure d'AFFICHAGE : rien n'est compté.
 */
export type PackingItem = PackingOrderItem | PackingTransferFrame;

/** Une commande de la liste, et sa barre de couleur. */
export interface PackingOrderItem {
  readonly kind: 'order';
  readonly key: string;
  readonly entry: PackingEntry;
  /** « Livraison pro », « Retrait particulier Adroit »… — la catégorie que la couleur dit. */
  readonly category: string;
  /** `#rrggbb`, ou `null` : la teinte neutre. */
  readonly color: string | null;
}

/**
 * Un élément de réapprovisionnement d'un site servi par transfert.
 *
 * ⚠️ **Forme réservée, rien ne la sert** (2026-10-14) : le réapprovisionnement
 * n'est pas bâti (`livraisons/transferts/plan-transfert-interne.md`). L'encadré
 * l'accepte pour qu'il s'y branche sans changer la forme ; aucun encadré vide
 * n'est jamais produit.
 */
export interface PackingReplenishmentItem {
  readonly key: string;
  readonly label: string;
}

/**
 * L'encadré d'un site servi par transfert (Hugo, 2026-10-25) : SA couleur —
 * celle du transfert posée en Réglages › Sites, sinon celle de la livraison
 * ({@link transferColorOf}) ; ses commandes portent chacune la barre et le
 * libellé de LEUR cas (« Retrait particulier Le Village »), comme hors encadré.
 */
export interface PackingTransferFrame {
  readonly kind: 'transfer';
  readonly key: string;
  readonly title: string;
  /** `#rrggbb`, ou `null` : la teinte neutre. */
  readonly color: string | null;
  readonly orders: readonly PackingOrderItem[];
  readonly replenishment: readonly PackingReplenishmentItem[];
}

/** Le réapprovisionnement à coliser, par site — `[]` tant qu'il n'est pas bâti. */
export interface PackingReplenishment {
  readonly siteId: string;
  readonly items: readonly PackingReplenishmentItem[];
}

/**
 * L'heure « prête pour » d'une fiche (L2) : `readyBy`, servi par le colisage ;
 * une fiche qui ne le porte pas du tout (construite avant lui) retombe sur
 * son échéance figée.
 */
export function deadlineOf(sheet: PackingEntry['sheet']): string | null {
  return sheet.readyBy === undefined ? (sheet.dueAt ?? null) : sheet.readyBy;
}

/** Un élément de premier niveau, et l'heure qui le range. */
interface Ranked {
  readonly item: PackingItem;
  readonly due: string | null;
}

export function packingFrames(
  entries: readonly PackingEntry[],
  palette: readonly SitePaletteEntryView[],
  replenishments: readonly PackingReplenishment[] = [],
): readonly PackingItem[] {
  const sorted = [...entries].sort((a, b) => compareDue(deadlineOf(a.sheet), deadlineOf(b.sheet)));
  const ranked: Ranked[] = [];
  const transfers = new Map<string, { site: SitePaletteEntryView; orders: PackingOrderItem[] }>();
  for (const entry of sorted) {
    const site = transferSiteOf(entry, palette);
    if (site === null) {
      ranked.push({ item: orderItem(entry, palette, 'named'), due: deadlineOf(entry.sheet) });
      continue;
    }
    // Dans l'encadré, la commande dit SON cas : l'encadré dit déjà le transfert.
    const order = orderItem(entry, palette, 'as-pickup');
    const found = transfers.get(site.id);
    if (found === undefined) {
      transfers.set(site.id, { site, orders: [order] });
    } else {
      found.orders.push(order);
    }
  }
  for (const replenishment of replenishments) {
    const site = palette.find((candidate) => candidate.id === replenishment.siteId);
    if (site !== undefined && replenishment.items.length > 0 && !transfers.has(site.id)) {
      transfers.set(site.id, { site, orders: [] });
    }
  }
  // Les encadrés passent DEVANT à heure égale : leur heure est celle de leur
  // commande la plus urgente, et le tri stable garde cet ordre.
  const boxes: Ranked[] = [...transfers.values()].map(({ site, orders }) => ({
    item: {
      kind: 'transfer',
      key: `transfer:${site.id}`,
      title: `Transfert ${site.label}`,
      color: transferColorOf(site, palette),
      orders,
      replenishment: replenishments
        .filter((replenishment) => replenishment.siteId === site.id)
        .flatMap((replenishment) => replenishment.items),
    },
    due: orders[0] === undefined ? null : deadlineOf(orders[0].entry.sheet),
  }));
  return [...boxes, ...ranked].sort((a, b) => compareDue(a.due, b.due)).map((one) => one.item);
}

/**
 * La pile dans l'ordre de la liste — donc de « la première », celle qui
 * s'ouvre d'elle-même : la plus urgente, sans en-tête de tournée devant
 * (Hugo, 2026-10-25). Dans une tournée, l'ordre de chargement départage.
 */
export function packingList(
  sheets: readonly PackingSheet[],
  rounds: readonly DeliveryPackingRoundView[],
  palette: readonly SitePaletteEntryView[],
): readonly PackingItem[] {
  return packingFrames(
    packingGroups(sheets, rounds).flatMap((group) => group.entries),
    palette,
  );
}

/** Les commandes de {@link packingList}, à plat, encadré du transfert compris. */
export function sheetsInListOrder(
  sheets: readonly PackingSheet[],
  rounds: readonly DeliveryPackingRoundView[],
  palette: readonly SitePaletteEntryView[],
): readonly PackingSheet[] {
  return packingList(sheets, rounds, palette).flatMap((item) =>
    item.kind === 'transfer' ? item.orders.map((order) => order.entry.sheet) : [item.entry.sheet],
  );
}

function orderItem(
  entry: PackingEntry,
  palette: readonly SitePaletteEntryView[],
  transferNaming: TransferNaming,
): PackingOrderItem {
  const category = logisticsCategoryOf(entry.sheet, palette, transferNaming);
  return {
    kind: 'order',
    key: entry.sheet.reference,
    entry,
    category: category.label,
    color: category.color,
  };
}

function transferSiteOf(
  entry: PackingEntry,
  palette: readonly SitePaletteEntryView[],
): SitePaletteEntryView | null {
  if (entry.sheet.fulfillmentMethod !== 'pickup') {
    return null;
  }
  const site = palette.find((candidate) => candidate.id === entry.sheet.siteId) ?? null;
  return site?.supply === 'transfer' ? site : null;
}

/** `HH:mm` se compare en texte ; sans échéance vient après. Le tri est stable. */
function compareDue(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}
