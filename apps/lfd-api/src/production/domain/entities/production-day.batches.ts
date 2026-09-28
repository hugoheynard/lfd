import {
  ProducedItemNotFoundError,
  ProductionDayNotClosedError,
} from "../errors/production-errors.js";
import {
  BatchConflictError,
  InvalidBatchQuantityError,
  BatchNotFoundError,
  BatchStillPackedError,
} from "../errors/batch-errors.js";
import { activeBatchesOf, implicitBatchesOf, outputOf } from "../services/production-output.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";
import type {
  DoneMark,
  ProducedItemSnapshot,
  ProductionBatchSnapshot,
  ProductionOrderSnapshot,
} from "./production-day.snapshot.js";

/**
 * **Les gardes des fournées** — ce qu'une journée refuse qu'on déclare, qu'on
 * annule ou qu'on décoche, **sans rien muter** (plan
 * `documentation/production/plan-fournees-progressives.md`, D3, D4).
 *
 * Même figure que `production-day.packing.ts`, et pour la même raison : le
 * fichier de l'agrégat dépasserait trois cents lignes. La journée reste le seul
 * point d'entrée — chaque garde est exposée par une méthode de `ProductionDay`.
 */

/** Ce qu'une garde lit d'une journée — et rien de ce qui la modifie. */
export interface BatchState {
  readonly day: ServiceDay;
  readonly isClosed: boolean;
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly counts: readonly ProducedItemSnapshot[];
  readonly batches: readonly ProductionBatchSnapshot[];
}

/** Les fournées réelles ET les implicites des coches héritées (§5.2). */
export function effectiveBatchesOf(state: BatchState): readonly ProductionBatchSnapshot[] {
  return [...state.batches, ...implicitBatchesOf(state.day.value, state.counts, state.batches)];
}

/** Σ des fournées qui comptent pour ce SKU, implicites comprises. */
export function producedOf(state: BatchState, sku: string): number {
  return activeBatchesOf(effectiveBatchesOf(state), sku).reduce(
    (total, batch) => total + batch.quantity,
    0,
  );
}

/** Les pièces de ce SKU déjà au bac, **bacs fermés compris** (D4). */
export function packedOf(state: BatchState, sku: string): number {
  let packed = 0;
  for (const order of state.orders) {
    for (const line of order.lines) {
      if (line.sku === sku && line.packed !== null) {
        packed += line.quantity;
      }
    }
  }
  return packed;
}

/**
 * **Le disponible** : sorti − au bac (D4). Peut être négatif sur une journée
 * colisée par l'ancien binaire, qui ne comptait rien ; la garde le lit comme
 * « rien de disponible », sans jamais le corriger.
 */
export function availableOf(state: BatchState, sku: string): number {
  return producedOf(state, sku) - packedOf(state, sku);
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
 * La fournée que l'ancienne commande « cocher » déclare : le **reste**, pour
 * rendre la ligne complète (D3). `null` = elle l'est déjà, et recocher passe
 * sans effet — recocher passait.
 *
 * ## L'identifiant, et l'écart au plan
 *
 * Le plan écrit `mark-<jour>-<sku>-<produced>`. Il y manque un terme : après un
 * décocher (qui annule tout), `produced` revient à 0, le même `id` est
 * recalculé, et l'idempotence le lit comme le rejeu d'une fournée annulée —
 * succès silencieux, ligne restée vide. Le nombre de fournées déjà écrites pour
 * ce SKU, annulées comprises, les distingue : deux cochers simultanés lisent le
 * même état et calculent toujours le même `id`, ce qui garde la propriété que
 * le plan voulait.
 */
export function batchToComplete(
  state: BatchState,
  item: ProducedItemSnapshot,
  recorded: DoneMark,
): ProductionBatchSnapshot | null {
  const effective = effectiveBatchesOf(state);
  const output = outputOf(item.quantity, activeBatchesOf(effective, item.sku));
  if (output.complete) {
    return null;
  }
  const written = effective.filter((batch) => batch.sku === item.sku).length;
  return {
    id: `mark-${state.day.value}-${item.sku}-${String(output.produced)}-${String(written)}`,
    sku: item.sku,
    quantity: output.remaining,
    recorded,
    cancelled: null,
  };
}

/**
 * La fournée qu'on s'apprête à annuler. `null` = déjà annulée : annuler deux
 * fois est un succès silencieux (D3).
 *
 * @throws {BatchNotFoundError} aucune fournée de ce jour sous cet `id`.
 * @throws {BatchStillPackedError} il resterait moins de pièces sorties que de
 *   pièces au bac, bacs fermés compris.
 */
export function batchToCancel(state: BatchState, id: string): ProductionBatchSnapshot | null {
  const target = effectiveBatchesOf(state).find((batch) => batch.id === id);
  if (target === undefined) {
    throw new BatchNotFoundError(id, state.day.value);
  }
  if (target.cancelled !== null) {
    return null;
  }
  const packed = packedOf(state, target.sku);
  if (producedOf(state, target.sku) - target.quantity < packed) {
    throw new BatchStillPackedError(productNameOf(state, target.sku), packed, "cancel");
  }
  return target;
}

/**
 * Les fournées que l'ancienne commande « décocher » annule : **toutes** celles
 * de la ligne (D3). Refusé dès qu'une pièce de ce SKU est au bac — le seul
 * changement de comportement de l'ancien contrat, et il est voulu.
 *
 * @throws {BatchStillPackedError} des pièces de cet article sont dans des sacs.
 */
export function batchesToUncheck(
  state: BatchState,
  sku: string,
): readonly ProductionBatchSnapshot[] {
  const active = activeBatchesOf(effectiveBatchesOf(state), sku);
  const packed = packedOf(state, sku);
  if (active.length > 0 && packed > 0) {
    throw new BatchStillPackedError(productNameOf(state, sku), packed, "uncheck");
  }
  return active;
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
 * La ligne qu'on s'apprête à cocher — **sans rien muter**.
 *
 * Même figure que `sheetToPack`, et pour la même raison : elle porte les
 * deux refus STRUCTURELS — la journée n'est pas arrêtée, ou ce SKU n'est pas
 * au compte du jour — en un seul endroit plutôt que recopiés chez les deux
 * appelants (cocher, décocher).
 *
 * Elle ne dit rien de l'état de la case. « Déjà cochée » n'est pas un refus
 * ici, contrairement au colisage : voir la note de l'adaptateur.
 *
 * @throws {ProductionDayNotClosedError} rien n'est arrêté, donc rien à cocher.
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
  return { id, sku, quantity, recorded, cancelled: null };
}

/**
 * **Les coches héritées à matérialiser** (§5.3), pour un SKU ou tous : elles
 * deviennent des fournées de la journée, sous le même `id` que le rattrapage.
 * Tout geste qui ajoute ou retire une fournée d'un SKU le fait d'abord — sinon
 * la première fournée réelle effacerait la coche implicite, et 30 cochés plus
 * 5 deviendraient 5.
 */
export function inheritedBatchesOf(
  state: BatchState,
  sku?: string,
): readonly ProductionBatchSnapshot[] {
  return implicitBatchesOf(state.day.value, state.counts, state.batches).filter(
    (batch) => sku === undefined || batch.sku === sku,
  );
}
