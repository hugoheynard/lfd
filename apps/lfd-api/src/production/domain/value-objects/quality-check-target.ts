import { QualityCheckTargetError } from "../errors/quality-check-errors.js";

/**
 * **Ce qu'un contrôle juge** — une ligne de préparation OU une commande colisée
 * (`plan-controle-qualite.md`, §0 et D2).
 *
 * Une union discriminée : une fois construite, une cible « à moitié ligne, à
 * moitié commande » est inexprimable. La factory {@link qualityCheckTargetOf}
 * est le seul passage depuis une forme lâche (payload, ligne de base).
 *
 * `sku` est celui du **compte** (`production_count.sku`), le même que
 * `production_order_line.sku` (D6) : une déclinaison n'est jamais comparée à un
 * produit. `quantitySeen` est le compte au moment du contrôle (D5).
 */
export type QualityCheckTarget =
  | { readonly kind: "line"; readonly sku: string; readonly quantitySeen: number }
  | { readonly kind: "order"; readonly orderId: string };

/** La forme lâche d'où l'on part : ce que portent un payload ou une ligne de base. */
export interface QualityCheckTargetInput {
  readonly kind: string;
  readonly sku?: string | null | undefined;
  readonly orderId?: string | null | undefined;
  readonly quantitySeen?: number | null | undefined;
}

/**
 * @throws {QualityCheckTargetError} la cible n'est pas exactement une ligne ou
 *   exactement une commande.
 */
export function qualityCheckTargetOf(input: QualityCheckTargetInput): QualityCheckTarget {
  if (input.kind === "line") {
    return lineTarget(input);
  }
  if (input.kind === "order") {
    return orderTarget(input);
  }
  throw new QualityCheckTargetError(`genre de cible inconnu « ${input.kind} »`);
}

function lineTarget(input: QualityCheckTargetInput): QualityCheckTarget {
  const sku = input.sku?.trim() ?? "";
  if (sku === "") {
    throw new QualityCheckTargetError("une ligne sans produit");
  }
  if (input.orderId !== undefined && input.orderId !== null) {
    throw new QualityCheckTargetError("une ligne qui nomme aussi une commande");
  }
  const quantity = input.quantitySeen;
  if (quantity === undefined || quantity === null || !Number.isInteger(quantity) || quantity < 0) {
    throw new QualityCheckTargetError("une ligne sans la quantité vue au contrôle");
  }
  return { kind: "line", sku, quantitySeen: quantity };
}

function orderTarget(input: QualityCheckTargetInput): QualityCheckTarget {
  const orderId = input.orderId?.trim() ?? "";
  if (orderId === "") {
    throw new QualityCheckTargetError("une commande sans identifiant");
  }
  if (input.sku !== undefined && input.sku !== null) {
    throw new QualityCheckTargetError("une commande qui nomme aussi un produit");
  }
  if (input.quantitySeen !== undefined && input.quantitySeen !== null) {
    throw new QualityCheckTargetError("une commande qui porte une quantité de ligne");
  }
  return { kind: "order", orderId };
}

/** La clé qui regroupe les contrôles d'une même cible, pour dire le verdict courant. */
export function qualityTargetKey(target: QualityCheckTarget): string {
  return target.kind === "line" ? `line:${target.sku}` : `order:${target.orderId}`;
}
