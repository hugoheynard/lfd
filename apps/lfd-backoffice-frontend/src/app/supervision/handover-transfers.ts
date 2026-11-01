import { instantToLocal } from '@lfd/contracts';
import type { DayInternalTransfersView, SitePaletteEntryView } from '@lfd/contracts';

import {
  type LogisticsCategory,
  transferColorOf,
} from '../shared/logistics-colors/logistics-category';
import { groupOf, rankOf, type SlotGroup } from './handover-slots';
import { clockLabel, countLabel, slotTimeLabel } from './supervision-labels';

/**
 * **Le transfert interne dans l'onglet Livraison** (Hugo, 2026-11-01 : « le
 * transfert dans la liste des livraisons »). Une ligne par transfert du jour,
 * rangée à son DÉPART REQUIS — le départ prévu de la tournée qui porte son
 * arrêt, l'heure « prête pour » de ses commandes au colisage — comme une
 * livraison à son échéance : la tranche `d06:45`, « Avant 6 h 45 ».
 *
 * Elle ne compte pas parmi les livraisons attendues : ses commandes sont des
 * retraits, déjà comptés dans l'onglet Retrait. Fonctions pures d'affichage.
 */
export interface TransferSlotRow {
  readonly transferId: string;
  readonly siteLabel: string;
  /** « 6 h 45 » : le départ requis ; `null` sans départ connu. */
  readonly time: string | null;
  /** « 3 commandes · 4 sacs », réassorts compris s'il y en a. */
  readonly contents: string;
  /** « Parti à 6 h 52 », « En attente du départ », « Pas encore dans une tournée ». */
  readonly state: string;
  readonly departed: boolean;
  /** La pastille : « Transfert <site> », à la couleur du transfert du site. */
  readonly mode: LogisticsCategory;
}

/** Une ligne de transfert et la clé de la tranche qui la range. */
export interface KeyedTransferRow {
  readonly key: string;
  readonly row: TransferSlotRow;
}

/** Les lignes des transferts d'une vue, chacune avec la clé de sa tranche. */
export function transferRowsOf(
  view: DayInternalTransfersView | null,
  palette: readonly SitePaletteEntryView[],
): readonly KeyedTransferRow[] {
  if (view === null) {
    return [];
  }
  return view.transfers.map((transfer) => {
    const departure = localTimeOn(view.day, transfer.plannedDepartureAt ?? transfer.departedAt);
    const site = palette.find((candidate) => candidate.id === transfer.siteId) ?? null;
    const departedAt = transfer.departedAt === null ? null : clockLabel(transfer.departedAt);
    return {
      key: departure === null ? 'none' : `d${departure}`,
      row: {
        transferId: transfer.transferId,
        siteLabel: transfer.siteLabel,
        time: departure === null ? null : slotTimeLabel(departure),
        contents: contentsOf(transfer),
        state: stateOf(transfer.departedAt !== null, departedAt, transfer.placed),
        departed: transfer.departedAt !== null,
        mode: {
          key: `transfer:${transfer.siteId}`,
          label: `Transfert ${transfer.siteLabel}`,
          color: site === null ? null : transferColorOf(site, palette),
        },
      },
    };
  });
}

/**
 * Les tranches de la livraison, et une tranche de plus pour un transfert dont
 * aucune livraison ne partage l'heure — dans l'ordre du jour.
 */
export function withTransferSlots(
  groups: readonly SlotGroup[],
  transfers: readonly KeyedTransferRow[],
): readonly SlotGroup[] {
  const known = new Set(groups.map((group) => group.key));
  const added = [...new Set(transfers.map(({ key }) => key))]
    .filter((key) => !known.has(key))
    .map((key) => groupOf(key, []));
  if (added.length === 0) {
    return groups;
  }
  // Tri stable : à rang égal, l'ordre des tranches servies tient.
  return [...groups, ...added].sort((a, b) => rankOf(a.key) - rankOf(b.key));
}

/** `HH:mm` à Paris si l'instant tombe le jour montré ; sinon `null`. */
function localTimeOn(day: string, iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  const local = instantToLocal(instant);
  return local.day === day ? local.time.slice(0, 5) : null;
}

function contentsOf(transfer: DayInternalTransfersView['transfers'][number]): string {
  const parts = [countLabel(transfer.orderCount, 'commande', 'commandes')];
  if (transfer.resupplyCount > 0) {
    parts.push(countLabel(transfer.resupplyCount, 'réassort', 'réassorts'));
  }
  parts.push(countLabel(transfer.binCount, 'sac', 'sacs'));
  return parts.join(' · ');
}

function stateOf(departed: boolean, departedAt: string | null, placed: boolean): string {
  if (departed) {
    return departedAt === null ? 'Parti' : `Parti à ${departedAt}`;
  }
  return placed ? 'En attente du départ' : 'Pas encore dans une tournée';
}
