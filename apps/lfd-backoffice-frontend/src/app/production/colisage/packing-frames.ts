import type { SitePaletteEntryView } from '@lfd/contracts';

import {
  inkOn,
  logisticsCategoryOf,
  type SwatchInk,
} from '../../shared/logistics-colors/logistics-category';
import type { PackingEntry } from './packing-rounds';

/**
 * **Les cadres de couleur de la colonne des commandes** (Hugo, 2026-10-13 —
 * plan `commandes/plan-tri-depart-et-couleurs.md`, L1b) : les commandes d'un
 * groupe rangées par catégorie logistique — et par tranche horaire quand la
 * catégorie en a plusieurs —, chaque cadre bordé à gauche et en haut de la
 * couleur, son titre écrit dans la bordure haute.
 *
 * Un ordre d'AFFICHAGE, en fonction pure : les cadres viennent dans l'ordre de
 * leur première commande, les commandes gardent leur ordre servi. Rien n'est
 * compté ni trié par heure ici (le tri par échéance est le lot L2).
 */
export interface PackingFrame {
  readonly key: string;
  /** « Transfert Val Village · particulier », « Livraison pro · 07:30 »… */
  readonly title: string;
  /** `#rrggbb`, ou `null` : la teinte neutre. */
  readonly color: string | null;
  /** L'encre du titre ; `neutral` : celle de la teinte neutre. */
  readonly ink: SwatchInk | 'neutral';
  readonly entries: readonly PackingEntry[];
}

/** Sans échéance : le titre le dit plutôt que d'inventer une heure. */
const NO_DUE = 'sans heure';

export function packingFrames(
  entries: readonly PackingEntry[],
  palette: readonly SitePaletteEntryView[],
): readonly PackingFrame[] {
  const categorized = entries.map((entry) => ({
    entry,
    category: logisticsCategoryOf(entry.sheet, palette),
  }));
  const slices = new Map<string, Set<string | null>>();
  for (const { entry, category } of categorized) {
    slices.set(
      category.key,
      (slices.get(category.key) ?? new Set()).add(entry.sheet.dueAt ?? null),
    );
  }
  const frames = new Map<
    string,
    { frame: Omit<PackingFrame, 'entries'>; entries: PackingEntry[] }
  >();
  for (const { entry, category } of categorized) {
    const sliced = (slices.get(category.key)?.size ?? 0) > 1;
    const key = sliced ? `${category.key}@${entry.sheet.dueAt ?? ''}` : category.key;
    const found = frames.get(key);
    if (found !== undefined) {
      found.entries.push(entry);
      continue;
    }
    const title = sliced ? `${category.label} · ${entry.sheet.dueAt ?? NO_DUE}` : category.label;
    const ink = category.color === null ? 'neutral' : inkOn(category.color);
    frames.set(key, { frame: { key, title, color: category.color, ink }, entries: [entry] });
  }
  return [...frames.values()].map(({ frame, entries: framed }) => ({ ...frame, entries: framed }));
}
