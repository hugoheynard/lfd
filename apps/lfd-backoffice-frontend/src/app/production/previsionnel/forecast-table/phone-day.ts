import type { ForecastCell, ForecastRayon } from '../previsionnel-matrix';

/**
 * **La journée lue sur téléphone** (Hugo, 2026-11-25) — des fonctions pures,
 * sur UNE colonne : ce qu'on a à faire, pas la semaine.
 *
 * Une référence compte une fois, par son SKU : un produit fait sur plusieurs
 * postes est dans plusieurs groupes, et une somme par groupe le compterait
 * deux fois. Les comptes sont en PIÈCES, comme le pied du poste : un produit
 * au poids compte pour une pièce (sa quantité est en grammes).
 */
export interface PhoneDayTotals {
  /** Les références à faire ce jour-là. */
  readonly refs: number;
  readonly pieces: number;
  /** La part des commandes. */
  readonly orders: number;
  /** La part des boutiques (réassorts). */
  readonly shops: number;
}

/** Les cases du jour, une par SKU, avec l'unité de vente de leur produit. */
function dayCells(
  rayons: readonly ForecastRayon[],
  index: number,
): ReadonlyMap<string, { readonly cell: ForecastCell; readonly weighed: boolean }> {
  const seen = new Map<string, { readonly cell: ForecastCell; readonly weighed: boolean }>();
  for (const rayon of rayons) {
    for (const line of rayon.lines) {
      const cell = line.cells[index];
      if (cell !== undefined && cell.quantity > 0) {
        seen.set(line.sku, { cell, weighed: line.saleUnit === 'weight' });
      }
    }
  }
  return seen;
}

/** Une quantité, en pièces. */
const asPieces = (quantity: number, weighed: boolean): number =>
  weighed ? (quantity > 0 ? 1 : 0) : quantity;

/** Ce que ces groupes ont à faire ce jour-là. */
export function phoneDayTotals(rayons: readonly ForecastRayon[], index: number): PhoneDayTotals {
  let pieces = 0;
  let orders = 0;
  let shops = 0;
  const cells = dayCells(rayons, index);
  for (const { cell, weighed } of cells.values()) {
    pieces += cell.pieces;
    orders += asPieces(cell.quantity - cell.resupply, weighed);
    shops += asPieces(cell.resupply, weighed);
  }
  return { refs: cells.size, pieces, orders, shops };
}

/**
 * Les groupes réduits à ce qu'il y a à faire ce jour-là : une ligne à zéro
 * n'est pas une tâche, et sur un téléphone elle cache celles qui en sont.
 * Un groupe sans rien à faire disparaît.
 */
export function rayonsToDo(
  rayons: readonly ForecastRayon[],
  index: number,
): readonly ForecastRayon[] {
  return rayons
    .map((rayon) => ({
      ...rayon,
      lines: rayon.lines.filter((line) => (line.cells[index]?.quantity ?? 0) > 0),
    }))
    .filter((rayon) => rayon.lines.length > 0);
}
