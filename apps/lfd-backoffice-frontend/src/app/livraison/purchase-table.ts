import type {
  BinTypeView,
  PurchaseBinCandidateView,
  PurchaseTableCellView,
  PurchaseTableFormatRef,
  PurchaseTableRowView,
  PurchaseTableVehicleRef,
  PurchaseTableView,
  PurchaseVehicleCandidateView,
  VehicleView,
} from '@lfd/contracts';

import { formatLiters, measuredVehicles } from './purchase-assistant';
import { costLabel, costPerLiterLabel, priceLabel } from './purchase-price';

/**
 * Les dérivations pures du **tableau croisé** de la bibliothèque d'achat
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, B-D4, lot B5) :
 * ce qu'on peut choisir, ce qui part, et ce qu'on dessine de la réponse.
 *
 * Le CLASSEMENT n'est pas ici : la meilleure case de chaque ligne vient du
 * serveur (`row.best`), l'écran ne fait que la lire pour le critère choisi —
 * deux classements divergeraient au premier arrondi.
 */

/** Ce qu'on classe : taux d'occupation, volume utile, coût par litre. */
export type PurchaseTableCriterion = 'occupation' | 'volume' | 'costPerLiter';

export const CRITERION_OPTIONS: readonly {
  readonly value: PurchaseTableCriterion;
  readonly label: string;
}[] = [
  { value: 'occupation', label: 'Taux d’occupation' },
  { value: 'volume', label: 'Volume utile' },
  { value: 'costPerLiter', label: 'Coût par litre' },
];

/** Un véhicule qu'on peut cocher, candidat ou de la flotte. */
export interface VehicleChoice {
  /** Identité d'écran : la source et l'id, uniques ensemble. */
  readonly key: string;
  readonly ref: PurchaseTableVehicleRef;
  readonly name: string;
  readonly detail: string;
}

/** Un format qu'on peut cocher, candidat ou type de bac en service. */
export interface FormatChoice {
  readonly key: string;
  readonly ref: PurchaseTableFormatRef;
  readonly name: string;
  readonly detail: string;
}

/** Les candidats en cours, puis les véhicules actifs de la flotte dont on connaît l'espace utile. */
export function vehicleChoices(
  candidates: readonly PurchaseVehicleCandidateView[],
  fleet: readonly VehicleView[],
): readonly VehicleChoice[] {
  return [
    ...candidates
      .filter((candidate) => candidate.archivedAt === null)
      .map((candidate) => ({
        key: `candidate:${candidate.id}`,
        ref: { source: 'candidate' as const, id: candidate.id },
        name: candidate.name,
        detail: `Candidat · ${priceLabel(candidate.priceCentsExclVat)}`,
      })),
    ...measuredVehicles(fleet).map((vehicle) => ({
      key: `fleet:${vehicle.id}`,
      ref: { source: 'fleet' as const, id: vehicle.id },
      name: vehicle.name,
      detail: `Flotte · ${vehicle.plate}`,
    })),
  ];
}

/** Les formats candidats en cours, puis les types de bacs en service. */
export function formatChoices(
  candidates: readonly PurchaseBinCandidateView[],
  binTypes: readonly BinTypeView[],
): readonly FormatChoice[] {
  return [
    ...candidates
      .filter((candidate) => candidate.archivedAt === null)
      .map((candidate) => ({
        key: `candidate:${candidate.id}`,
        ref: { source: 'candidate' as const, id: candidate.id },
        name: candidate.name,
        detail: `Candidat · ${priceLabel(candidate.unitPriceCentsExclVat)} l’unité`,
      })),
    ...binTypes
      .filter((type) => type.archivedAt === null)
      .map((type) => ({
        key: `bin_type:${type.id}`,
        ref: { source: 'bin_type' as const, id: type.id },
        name: type.name,
        detail: `En service · ${String(type.innerVolumeLiters)} L`,
      })),
  ];
}

/**
 * Coche ou décoche une clé. Au-delà de `max`, la coche est ignorée : l'écran
 * désactive la case, et la borne du serveur n'est jamais atteinte par surprise.
 */
export function toggleKey(
  selected: readonly string[],
  key: string,
  checked: boolean,
  max: number,
): readonly string[] {
  if (!checked) {
    return selected.filter((k) => k !== key);
  }
  if (selected.includes(key) || selected.length >= max) {
    return selected;
  }
  return [...selected, key];
}

/** Les références cochées, dans l'ordre de la liste (celui des lignes et des colonnes). */
export function pickedRefs<T extends { readonly key: string }, R>(
  choices: readonly T[],
  selected: readonly string[],
  refOf: (choice: T) => R,
): readonly R[] {
  return choices.filter((choice) => selected.includes(choice.key)).map(refOf);
}

/** Une case dessinée. */
export interface GridCell {
  readonly best: boolean;
  readonly total: string;
  readonly occupation: string;
  readonly volume: string;
  readonly equipmentCost: string;
  readonly totalCost: string;
  readonly costPerLiter: string;
}

/** Une ligne dessinée : un véhicule. */
export interface GridRow {
  readonly key: string;
  readonly name: string;
  readonly detail: string;
  readonly bestRow: boolean;
  readonly cells: readonly GridCell[];
}

function cellOf(cell: PurchaseTableCellView, best: boolean): GridCell {
  return {
    best,
    total: cell.total === 1 ? '1 bac' : `${String(cell.total)} bacs`,
    occupation: `${String(cell.vehiclePercent)} %`,
    volume: formatLiters(cell.usefulLiters),
    equipmentCost: costLabel(cell.equipmentCostCents),
    totalCost: costLabel(cell.totalCostCents),
    costPerLiter: costPerLiterLabel(cell.costPerLiterCents),
  };
}

function rowOf(
  row: PurchaseTableRowView,
  index: number,
  criterion: PurchaseTableCriterion,
  bestRow: number | null,
): GridRow {
  const best = row.best[criterion];
  return {
    key: `${row.source}:${row.id}`,
    name: row.name,
    detail: `${formatLiters(row.vehicleVolumeLiters)} · ${priceLabel(row.priceCentsExclVat)}`,
    bestRow: bestRow === index,
    cells: row.cells.map((cell, column) => cellOf(cell, best === column)),
  };
}

/**
 * Les lignes à dessiner. La meilleure case vient de `row.best[criterion]`, et
 * la meilleure ligne (`bestRowByCostPerLiter`) ne se montre que si le coût par
 * litre est demandé : elle en dépend.
 */
export function gridRows(
  view: PurchaseTableView,
  criterion: PurchaseTableCriterion,
  showCostPerLiter: boolean,
): readonly GridRow[] {
  const bestRow = showCostPerLiter ? view.bestRowByCostPerLiter : null;
  return view.rows.map((row, index) => rowOf(row, index, criterion, bestRow));
}
