import type {
  DeliveryPackingRoundView,
  DeliveryPackingStopView,
  PackingSheet,
} from '@lfd/contracts';

import { roundLabel } from '../../livraison/delivery-rounds';

/**
 * **Le poste rangé par tournée** (`decisions-par-defaut-2026-10-02.md`, lot
 * PC2) — en fonctions pures, et aucune n'est un calcul : l'ordre des arrêts
 * (du dernier au premier) et « n prêtes sur m » viennent du serveur de la
 * livraison ; on ne fait ici que RANGER les commandes servies par le fournil
 * dans cet ordre-là.
 *
 * 🔴 Un ordre d'AFFICHAGE, rien n'est imposé : on ouvre n'importe quelle
 * commande, dans n'importe quel ordre. Les commandes hors tournée — le retrait
 * au comptoir, une livraison pas encore répartie — suivent, dans l'ordre servi.
 */

/** Une commande de la liste, et l'arrêt qui la porte s'il y en a un. */
export interface PackingEntry {
  readonly sheet: PackingSheet;
  readonly stop: DeliveryPackingStopView | null;
}

/** Une tournée et ses commandes, ou (`round: null`) celles qui ne sont dans aucune. */
export interface PackingGroup {
  readonly round: DeliveryPackingRoundView | null;
  readonly entries: readonly PackingEntry[];
}

/**
 * Range les commandes par tournée, dans l'ordre servi des tournées puis des
 * arrêts ; une tournée sans commande dans la liste disparaît. Le reste vient
 * après, en un groupe sans tournée.
 */
export function packingGroups(
  sheets: readonly PackingSheet[],
  rounds: readonly DeliveryPackingRoundView[],
): readonly PackingGroup[] {
  const byOrder = new Map(sheets.map((sheet) => [sheet.orderId, sheet]));
  const placed = new Set<string>();
  const groups: PackingGroup[] = [];
  for (const round of rounds) {
    const entries = round.stops.flatMap((stop) => {
      const sheet = byOrder.get(stop.orderId);
      if (sheet === undefined || placed.has(stop.orderId)) {
        return [];
      }
      placed.add(stop.orderId);
      return [{ sheet, stop }];
    });
    if (entries.length > 0) {
      groups.push({ round, entries });
    }
  }
  const rest = sheets.filter((sheet) => !placed.has(sheet.orderId));
  if (rest.length > 0) {
    groups.push({ round: null, entries: rest.map((sheet) => ({ sheet, stop: null })) });
  }
  return groups;
}

/** Les commandes dans l'ordre des groupes — celui de la liste, donc de « la première ». */
export function sheetsInRoundOrder(
  sheets: readonly PackingSheet[],
  rounds: readonly DeliveryPackingRoundView[],
): readonly PackingSheet[] {
  return packingGroups(sheets, rounds).flatMap((group) =>
    group.entries.map((entry) => entry.sheet),
  );
}

/** « Kangoo blanc · passage 2 · partie » — le titre d'un groupe. */
export function packingRoundTitle(round: DeliveryPackingRoundView | null): string {
  if (round === null) {
    return 'Hors tournée';
  }
  const label = roundLabel(round);
  return round.departedAt === null ? label : `${label} · partie`;
}

/** « 2 commandes prêtes sur 5 » — compté au serveur. */
export function readyOrdersLabel(
  round: Pick<DeliveryPackingRoundView, 'readyStops' | 'stopCount'>,
): string {
  // « 0 commande prête » : le français garde le singulier sous deux.
  const ready =
    round.readyStops < 2
      ? `${String(round.readyStops)} commande prête`
      : `${String(round.readyStops)} commandes prêtes`;
  return `${ready} sur ${String(round.stopCount)}`;
}
