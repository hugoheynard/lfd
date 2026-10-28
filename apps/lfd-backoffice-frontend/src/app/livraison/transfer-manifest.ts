import type {
  InternalTransferManifestView,
  TransferManifestLineView,
  TransferManifestSectionView,
} from '@lfd/contracts';
import { pieceTally } from '@lfd/money';

/**
 * **Le manifeste d'un transfert, mis en mots** (plan du transfert interne,
 * lot T1 : « on doit savoir ce qu'on transporte »). Hors de tout composant :
 * le dialogue des tournées et l'arrêt de « Ma tournée » l'écrivent pareil.
 */

/** Une section du manifeste, prête à lire. */
export interface ManifestSection {
  readonly key: 'orders' | 'resupplies';
  readonly title: string;
  readonly subtitle: string;
  readonly totals: readonly TransferManifestLineView[];
}

/**
 * Les pièces d'une liste de lignes. Un article au poids compte pour UNE
 * pièce (pour rien à 0 g), jamais pour ses grammes : 1 250 g de saumon ne
 * font pas 1 250 pièces au sous-titre (P6 de `vente-au-poids.md`, la
 * règle `pieceTally`).
 */
export function unitsOf(lines: readonly TransferManifestLineView[]): number {
  return lines.reduce(
    (sum, line) => sum + pieceTally({ amount: line.quantity, unit: line.saleUnit }),
    0,
  );
}

/** « 3 commandes · 42 pièces ». */
export function sectionSubtitle(
  count: number,
  one: string,
  many: string,
  lines: readonly TransferManifestLineView[],
): string {
  const units = unitsOf(lines);
  return `${count} ${count === 1 ? one : many} · ${units} ${units === 1 ? 'pièce' : 'pièces'}`;
}

/**
 * Les sections NON vides, commandes d'abord. Une section vide ne s'écrit pas :
 * « Réassorts : 0 » sur chaque transfert ferait chercher ce qui n'y est pas.
 * Le réassort d'un point servi par transfert y entre à l'arrêt du plan depuis
 * R3c (2026-10-21), le même mot que le papier de tournée — « Réassort » depuis
 * R1g, qui ajoute au sous-titre les noms des réassorts nommés.
 */
export function manifestSections(
  view: Pick<InternalTransferManifestView, 'orders' | 'resupplies'>,
): readonly ManifestSection[] {
  const sections: ManifestSection[] = [];
  if (view.orders.items.length > 0) {
    sections.push(section('orders', 'Commandes', 'commande', 'commandes', view.orders));
  }
  if (view.resupplies.items.length > 0) {
    sections.push(section('resupplies', 'Réassorts', 'réassort', 'réassorts', view.resupplies));
  }
  return sections;
}

function section(
  key: ManifestSection['key'],
  title: string,
  one: string,
  many: string,
  view: TransferManifestSectionView,
): ManifestSection {
  const names = [
    ...new Set(view.items.flatMap((item) => (item.name === undefined ? [] : [item.name]))),
  ];
  const counted = sectionSubtitle(view.items.length, one, many, view.totals);
  return {
    key,
    title,
    subtitle: names.length === 0 ? counted : `${counted} · ${names.join(', ')}`,
    totals: view.totals,
  };
}

/** « Figé au départ » ou « Calculé à l'instant — peut encore changer ». */
export function manifestFreshness(view: InternalTransferManifestView): string {
  return view.frozen
    ? 'Figé au départ : c’est ce que le site doit recevoir.'
    : 'Calculé à l’instant : il suit les commandes jusqu’au départ.';
}
