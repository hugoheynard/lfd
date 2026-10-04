import type { PackableLine } from "./packable.js";

/**
 * **Une ligne comparée** — le colisable de l'ancien chemin face à celui de
 * l'ombre (plan `colisage/plan-domaine-colisage.md`, K1 ; §13 : « ce que l'ombre
 * compare : le colisable seulement, pas les bacs faits »).
 *
 * `null` d'un côté = la ligne n'y existe pas : une commande que la liste n'a
 * pas apportée à l'ombre, ou que le fournil ne porte pas.
 */
export interface ComparedLine {
  readonly orderId: string;
  readonly reference: string;
  readonly sku: string;
  readonly legacy: PackableLine | null;
  readonly shadow: PackableLine | null;
  /** Même quantité due ET même verdict — sinon c'est un écart. */
  readonly matches: boolean;
}

/** La comparaison d'une journée, ligne à ligne, triée par référence puis article. */
export interface ShadowComparison {
  readonly lines: readonly ComparedLine[];
  readonly gaps: number;
}

/** Compare deux colisables d'une même journée, ligne à ligne (commande × article). */
export function compareShadow(
  legacy: readonly PackableLine[],
  shadow: readonly PackableLine[],
): ShadowComparison {
  const keys = new Map<string, { orderId: string; reference: string; sku: string }>();
  const legacyByKey = indexed(legacy, keys);
  const shadowByKey = indexed(shadow, keys);
  const lines = [...keys.entries()]
    .map(([key, line]): ComparedLine => {
      const left = legacyByKey.get(key) ?? null;
      const right = shadowByKey.get(key) ?? null;
      return { ...line, legacy: left, shadow: right, matches: same(left, right) };
    })
    .sort((a, b) => compareText(a.reference, b.reference) || compareText(a.sku, b.sku));
  return { lines, gaps: lines.filter((line) => !line.matches).length };
}

function indexed(
  lines: readonly PackableLine[],
  keys: Map<string, { orderId: string; reference: string; sku: string }>,
): ReadonlyMap<string, PackableLine> {
  const byKey = new Map<string, PackableLine>();
  for (const line of lines) {
    const key = `${line.orderId}\u0000${line.sku}`;
    byKey.set(key, line);
    keys.set(key, { orderId: line.orderId, reference: line.reference, sku: line.sku });
  }
  return byKey;
}

function same(left: PackableLine | null, right: PackableLine | null): boolean {
  return (
    left !== null &&
    right !== null &&
    left.quantity === right.quantity &&
    left.packable === right.packable
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
