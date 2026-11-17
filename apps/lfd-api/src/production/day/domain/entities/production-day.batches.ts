import {
  ProducedItemNotFoundError,
  ProductionDayNotClosedError,
} from "../errors/production-errors.js";
import {
  BatchConflictError,
  InvalidBatchQuantityError,
  BatchNotFoundError,
  BatchReturnPendingError,
} from "../errors/batch-errors.js";
import { activeBatchesOf, countedBatch } from "../services/production-output.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";
import type {
  DoneMark,
  ProducedItemSnapshot,
  ProductionBatchSnapshot,
  ProductionOrderSnapshot,
} from "./production-day.snapshot.js";

/**
 * **Les gardes des fournées** — ce qu'une journée refuse qu'on déclare ou
 * annule, **sans rien muter** (plan
 * `documentation/fournil/la-fiche-d-atelier.md`, D3, D4).
 *
 * Des fonctions pures sur {@link BatchState}, sans transition : elles ne
 * lisent qu'un état et refusent. La journée reste le seul point d'entrée —
 * chaque garde est exposée par une méthode de `ProductionDayState`
 * (`production-day.state.ts`), la base de l'agrégat.
 */

/** Ce qu'une garde lit d'une journée — et rien de ce qui la modifie. */
export interface BatchState {
  readonly day: ServiceDay;
  readonly isClosed: boolean;
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly counts: readonly ProducedItemSnapshot[];
  readonly batches: readonly ProductionBatchSnapshot[];
}

/**
 * Les fournées de la journée, chacune pour ce qu'elle compte — rendus du
 * colisage déduits (K2, `countedBatch`).
 */
export function effectiveBatchesOf(state: BatchState): readonly ProductionBatchSnapshot[] {
  return state.batches.map(countedBatch);
}

/** Σ des fournées qui comptent pour ce SKU. */
export function producedOf(state: BatchState, sku: string): number {
  return activeBatchesOf(effectiveBatchesOf(state), sku).reduce(
    (total, batch) => total + batch.quantity,
    0,
  );
}

/** Le nom lu par le fournil : celui du compte, sinon celui d'un bon. */
function productNameOf(state: BatchState, sku: string): string {
  const counted = state.counts.find((item) => item.sku === sku)?.productName;
  if (counted !== undefined) {
    return counted;
  }
  for (const order of state.orders) {
    const line = order.lines.find((candidate) => candidate.sku === sku);
    if (line !== undefined) {
      return line.productName;
    }
  }
  return sku;
}

/**
 * La fournée qu'on s'apprête à annuler. `null` = déjà annulée : annuler deux
 * fois est un succès silencieux (D3).
 *
 * @throws {BatchNotFoundError} aucune fournée de ce jour sous cet `id`.
 * @throws {BatchReturnPendingError} un retour est déjà demandé au colisage (K2).
 */
export function batchToCancel(state: BatchState, id: string): ProductionBatchSnapshot | null {
  const target = effectiveBatchesOf(state).find((batch) => batch.id === id);
  if (target === undefined) {
    throw new BatchNotFoundError(id, state.day.value);
  }
  if (target.cancelled !== null) {
    return null;
  }
  if (target.pendingReturn > 0) {
    throw new BatchReturnPendingError(productNameOf(state, target.sku), target.pendingReturn);
  }
  return target;
}

/**
 * **L'idempotence d'une déclaration** (D3) : la base a rendu ce qu'elle porte
 * sous l'`id` demandé. Même charge — jour, SKU, quantité — et c'est un rejeu :
 * succès silencieux, **même si elle a été annulée depuis** (le rejeu ne
 * ressuscite rien). Autre charge : refus qui nomme le conflit.
 *
 * L'heure, l'auteur et les initiales ne sont PAS la charge : un rejeu après une
 * coupure porte une autre heure, et c'est pourtant le même geste.
 *
 * @throws {BatchConflictError} le même `id` porte une autre fournée.
 */
export function assertSameCharge(
  serviceDay: string,
  requested: ProductionBatchSnapshot,
  storedDay: string,
  stored: ProductionBatchSnapshot,
): void {
  if (
    storedDay === serviceDay &&
    stored.sku === requested.sku &&
    stored.quantity === requested.quantity
  ) {
    return;
  }
  throw new BatchConflictError(
    requested.id,
    chargeOf(storedDay, stored),
    chargeOf(serviceDay, requested),
  );
}

function chargeOf(serviceDay: string, batch: ProductionBatchSnapshot): string {
  return `${String(batch.quantity)} « ${batch.sku} » le ${serviceDay}`;
}

/**
 * La ligne à laquelle on s'apprête à ajouter une fournée — **sans rien muter**.
 *
 * Même figure que `sheetToPack` : elle porte les deux refus STRUCTURELS — la
 * journée n'est pas arrêtée, ou ce SKU n'est pas au compte du jour — en un
 * seul endroit. Une ligne déjà complète n'est pas un refus : une fournée de
 * plus est un surplus (décision 4).
 *
 * @throws {ProductionDayNotClosedError} rien n'est arrêté, donc rien à déclarer.
 * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
 */
export function itemToMark(state: BatchState, sku: string): ProducedItemSnapshot {
  if (!state.isClosed) {
    throw new ProductionDayNotClosedError(state.day.value);
  }
  const target = state.counts.find((item) => item.sku === sku);
  if (target === undefined) {
    throw new ProducedItemNotFoundError(sku, state.day.value);
  }
  return target;
}

/**
 * La fournée à déclarer — **sans muter** : les refus d'{@link itemToMark}
 * (journée non arrêtée, SKU hors compte), puis une quantité qui n'est pas des
 * pièces.
 *
 * @throws {InvalidBatchQuantityError} moins d'une pièce, ou pas un entier.
 */
export function batchToRecord(
  state: BatchState,
  id: string,
  sku: string,
  quantity: number,
  recorded: DoneMark,
): ProductionBatchSnapshot {
  itemToMark(state, sku);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvalidBatchQuantityError(quantity);
  }
  return {
    id,
    sku,
    quantity,
    recorded,
    cancelled: null,
    returned: 0,
    pendingReturn: 0,
    corrected: 0,
  };
}
