import type { SitePaletteEntryView } from '@lfd/contracts';

import {
  inkOn,
  logisticsCategoryOf,
  type SwatchInk,
} from '../../shared/logistics-colors/logistics-category';
import type { PackingEntry } from './packing-rounds';

/**
 * **Les cadres de couleur de la colonne des commandes** (Hugo, 2026-10-13,
 * revus le 2026-10-14 — plan `commandes/back-office/tri-depart-et-couleurs.md`, L1b
 * puis L2). Chaque cadre est bordé à gauche et en haut de sa couleur, son
 * titre écrit dans la bordure haute :
 *
 * 1. un cadre **Transfert <site>** par site servi par transfert, qui CONTIENT
 *    ses retraits par clientèle (« Retrait pro Val Village »…) et, quand il
 *    sera bâti, son réapprovisionnement ;
 * 2. **Livraison pro**, **Livraison particulier** (puis « Livraison »,
 *    clientèle inconnue) — UN cadre chacun, jamais coupé par heure ;
 * 3. les **retraits sur place**, coupés par créneau quand une catégorie en a
 *    plusieurs (« Retrait particulier Adroit · 08:00 »).
 *
 * **L'ordre est celui de l'heure « prête pour »** (L2, Hugo 2026-10-14) : les
 * commandes d'un cadre par heure croissante, les cadres par leur heure la plus
 * tôt, sans heure en dernier. À heure égale, l'ordre ci-dessus départage, puis
 * l'ordre servi (le tri est stable : dans une tournée, l'ordre de chargement).
 *
 * Fonction pure d'AFFICHAGE : rien n'est compté.
 */
export type PackingFrame = PackingOrderFrame | PackingTransferFrame;

/** Ce que tout cadre coloré porte. */
interface PackingFrameHead {
  readonly key: string;
  /** « Livraison pro », « Retrait particulier Adroit · 08:00 »… */
  readonly title: string;
  /** `#rrggbb`, ou `null` : la teinte neutre. */
  readonly color: string | null;
  /** L'encre du titre ; `neutral` : celle de la teinte neutre. */
  readonly ink: SwatchInk | 'neutral';
}

/** Un cadre de commandes. */
export interface PackingOrderFrame extends PackingFrameHead {
  readonly kind: 'orders';
  readonly entries: readonly PackingEntry[];
}

/**
 * Un élément de réapprovisionnement d'un site servi par transfert.
 *
 * ⚠️ **Forme réservée, rien ne la sert** (2026-10-14) : le réapprovisionnement
 * n'est pas bâti (`livraisons/transferts/plan-transfert-interne.md`). Le cadre
 * l'accepte pour qu'il s'y branche sans changer la forme ; aucun cadre vide
 * n'est jamais produit.
 */
export interface PackingReplenishmentItem {
  readonly key: string;
  readonly label: string;
}

/** Le cadre du réapprovisionnement d'un site — jamais vide. */
export interface PackingReplenishmentFrame extends PackingFrameHead {
  readonly kind: 'replenishment';
  readonly items: readonly PackingReplenishmentItem[];
}

/**
 * Le cadre englobant d'un site servi par transfert. NEUTRE, délibérément : il
 * mêle des clientèles, comme l'arrêt de transfert des tournées, qui n'est pas
 * peint non plus ; ce sont ses cadres intérieurs qui portent les couleurs.
 */
export interface PackingTransferFrame {
  readonly kind: 'transfer';
  readonly key: string;
  readonly title: string;
  readonly frames: readonly (PackingOrderFrame | PackingReplenishmentFrame)[];
}

/** Le réapprovisionnement à coliser, par site — `[]` tant qu'il n'est pas bâti. */
export interface PackingReplenishment {
  readonly siteId: string;
  readonly items: readonly PackingReplenishmentItem[];
}

/** Sans échéance : le titre le dit plutôt que d'inventer une heure. */
const NO_DUE = 'sans heure';

const CLIENTELE_WORDS: Readonly<Record<'pro' | 'public', string>> = {
  pro: 'pro',
  public: 'particulier',
};

/** L'ordre des cadres de livraison : pro, particulier, puis clientèle inconnue. */
const DELIVERY_ORDER: readonly string[] = ['delivery:pro', 'delivery:public', 'delivery'];

interface Bucket {
  readonly head: Omit<PackingFrameHead, 'title'> & { readonly title: string };
  readonly entries: PackingEntry[];
  /** La plus tôt des heures « prête pour » du cadre. */
  due: string | null;
}

/**
 * L'heure « prête pour » d'une fiche (L2) : `readyBy`, servi par le colisage ;
 * une fiche qui ne le porte pas du tout (construite avant lui) retombe sur
 * son échéance figée.
 */
export function deadlineOf(sheet: PackingEntry['sheet']): string | null {
  return sheet.readyBy === undefined ? (sheet.dueAt ?? null) : sheet.readyBy;
}

/** Un cadre de premier niveau, et l'heure qui le range. */
interface Ranked {
  readonly frame: PackingFrame;
  readonly due: string | null;
}

export function packingFrames(
  entries: readonly PackingEntry[],
  palette: readonly SitePaletteEntryView[],
  replenishments: readonly PackingReplenishment[] = [],
): readonly PackingFrame[] {
  const sorted = [...entries].sort((a, b) => compareDue(deadlineOf(a.sheet), deadlineOf(b.sheet)));
  const transfers = transferFrames(sorted, palette, replenishments);
  const deliveries = bucketize(
    sorted.filter((entry) => entry.sheet.fulfillmentMethod === 'delivery'),
    palette,
    false,
  ).sort((a, b) => DELIVERY_ORDER.indexOf(a.head.key) - DELIVERY_ORDER.indexOf(b.head.key));
  const pickups = bucketize(
    sorted.filter(
      (entry) =>
        entry.sheet.fulfillmentMethod === 'pickup' && transferSiteOf(entry, palette) === null,
    ),
    palette,
    true,
  );
  const ranked: Ranked[] = [
    ...transfers,
    ...[...deliveries, ...pickups].map((bucket) => ({
      frame: orderFrame(bucket),
      due: bucket.due,
    })),
  ];
  return ranked.sort((a, b) => compareDue(a.due, b.due)).map((one) => one.frame);
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

/** Un cadre englobant par site servi par transfert, dans l'ordre de sa première commande. */
function transferFrames(
  entries: readonly PackingEntry[],
  palette: readonly SitePaletteEntryView[],
  replenishments: readonly PackingReplenishment[],
): Ranked[] {
  const sites = new Map<string, { site: SitePaletteEntryView; entries: PackingEntry[] }>();
  for (const entry of entries) {
    const site = transferSiteOf(entry, palette);
    if (site !== null) {
      const found = sites.get(site.id) ?? { site, entries: [] };
      found.entries.push(entry);
      sites.set(site.id, found);
    }
  }
  for (const replenishment of replenishments) {
    const site = palette.find((candidate) => candidate.id === replenishment.siteId);
    if (site !== undefined && replenishment.items.length > 0 && !sites.has(site.id)) {
      sites.set(site.id, { site, entries: [] });
    }
  }
  return [...sites.values()].map(({ site, entries: own }) => {
    const items = replenishments
      .filter((replenishment) => replenishment.siteId === site.id)
      .flatMap((replenishment) => replenishment.items);
    // Ses retraits partent ENSEMBLE, avec le transfert : l'ordre fixe reste
    // (pro, particulier) ; c'est le cadre englobant qui se range par heure.
    const buckets = transferPickupBuckets(own, site);
    const inner: (PackingOrderFrame | PackingReplenishmentFrame)[] = buckets.map(orderFrame);
    if (items.length > 0) {
      inner.push({
        kind: 'replenishment',
        key: `replenishment:${site.id}`,
        title: `Réassort ${site.label}`,
        color: null,
        ink: 'neutral',
        items,
      });
    }
    const frame: PackingTransferFrame = {
      kind: 'transfer',
      key: `transfer:${site.id}`,
      title: `Transfert ${site.label}`,
      frames: inner,
    };
    return { frame, due: buckets.map((bucket) => bucket.due).sort(compareDue)[0] ?? null };
  });
}

/** Les retraits d'un site servi par transfert, par clientèle : pro, particulier, inconnue. */
function transferPickupBuckets(
  entries: readonly PackingEntry[],
  site: SitePaletteEntryView,
): Bucket[] {
  const order: readonly ('pro' | 'public' | null)[] = ['pro', 'public', null];
  return order.flatMap((clientele) => {
    const own = entries.filter((entry) => (entry.sheet.clientele ?? null) === clientele);
    const first = own[0];
    if (first === undefined) {
      return [];
    }
    const color =
      clientele === null ? null : clientele === 'pro' ? site.pickupColorB2b : site.pickupColorB2c;
    const title =
      clientele === null
        ? `Retrait ${site.label}`
        : `Retrait ${CLIENTELE_WORDS[clientele]} ${site.label}`;
    return [
      {
        head: {
          key: `pickup:${site.id}:${clientele ?? 'unknown'}`,
          title,
          color,
          ink: inkOf(color),
        },
        entries: own,
        due: deadlineOf(first.sheet),
      },
    ];
  });
}

/**
 * Range par catégorie logistique, dans l'ordre de la première commande ; avec
 * `sliced`, une catégorie à plusieurs échéances se coupe par créneau.
 */
function bucketize(
  entries: readonly PackingEntry[],
  palette: readonly SitePaletteEntryView[],
  sliced: boolean,
): Bucket[] {
  const categorized = entries.map((entry) => ({
    entry,
    category: logisticsCategoryOf(entry.sheet, palette),
  }));
  const slices = new Map<string, Set<string | null>>();
  for (const { entry, category } of categorized) {
    slices.set(category.key, (slices.get(category.key) ?? new Set()).add(deadlineOf(entry.sheet)));
  }
  const buckets = new Map<string, Bucket>();
  for (const { entry, category } of categorized) {
    const due = deadlineOf(entry.sheet);
    const cut = sliced && (slices.get(category.key)?.size ?? 0) > 1;
    const key = cut ? `${category.key}@${due ?? ''}` : category.key;
    const found = buckets.get(key);
    if (found !== undefined) {
      found.entries.push(entry);
      found.due = compareDue(due, found.due) < 0 ? due : found.due;
      continue;
    }
    const title = cut ? `${category.label} · ${due ?? NO_DUE}` : category.label;
    buckets.set(key, {
      head: { key, title, color: category.color, ink: inkOf(category.color) },
      entries: [entry],
      due,
    });
  }
  return [...buckets.values()];
}

function orderFrame(bucket: Bucket): PackingOrderFrame {
  return { kind: 'orders', ...bucket.head, entries: bucket.entries };
}

function inkOf(color: string | null): SwatchInk | 'neutral' {
  return color === null ? 'neutral' : inkOn(color);
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
