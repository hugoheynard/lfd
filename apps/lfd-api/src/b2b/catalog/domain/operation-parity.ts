import type { CatalogOperationFacts, OperationText } from "./entities/catalog-operation.js";

/**
 * **Ce qu'un envoi ferait aux opérations datées du canal.**
 *
 * La confrontation des articles ne voit pas les opérations : une opération
 * préparée au référentiel ne change aucun article, et l'aperçu concluait « la
 * boutique est à jour » en grisant l'envoi — elle ne pouvait donc jamais partir
 * (constaté à l'écran le 2026-09-24). Ce calcul en est la moitié manquante.
 *
 * **Pur** : ce que l'envoi porterait, ce que le miroir tient, un constat.
 */

/** Une opération telle que l'envoi la porterait — sans l'instant de réception. */
export type ReferenceOperation = Omit<CatalogOperationFacts, "receivedAt">;

/** Une opération du miroir, retirée ou non. */
export interface MirrorOperation {
  readonly facts: ReferenceOperation;
  readonly withdrawnAt: Date | null;
}

export type OperationChangeKind = "added" | "changed" | "withdrawn" | "unchanged";

export interface OperationChange {
  readonly key: string;
  /** Le nom en français — celui du référentiel pour ce qui part, du miroir pour ce qui sort. */
  readonly name: string;
  readonly change: OperationChangeKind;
}

/**
 * Les opérations de l'envoi dans leur ordre, puis celles qu'il retirerait.
 *
 * Une opération que le miroir tient RETIRÉE et que l'envoi porte de nouveau
 * ENTRE : pour le canal, elle revient en vente. Une opération retirée que
 * l'envoi ne porte pas n'apparaît pas — l'envoi ne lui fait rien.
 */
export function compareOperations(
  reference: readonly ReferenceOperation[],
  mirror: readonly MirrorOperation[],
): readonly OperationChange[] {
  const held = new Map(
    mirror.filter((entry) => entry.withdrawnAt === null).map((entry) => [entry.facts.key, entry]),
  );
  const sent = new Set(reference.map((operation) => operation.key));

  const outgoing = reference.map((operation): OperationChange => {
    const known = held.get(operation.key);
    const change: OperationChangeKind =
      known === undefined
        ? "added"
        : sameOperation(operation, known.facts)
          ? "unchanged"
          : "changed";
    return { key: operation.key, name: operation.name.fr, change };
  });
  const withdrawn = [...held.values()]
    .filter((entry) => !sent.has(entry.facts.key))
    .map((entry): OperationChange => ({
      key: entry.facts.key,
      name: entry.facts.name.fr,
      change: "withdrawn",
    }));
  return [...outgoing, ...withdrawn];
}

/** Tous les champs que le fil porte — la sélection comparée DANS SON ORDRE : c'est l'ordre du rayon. */
function sameOperation(left: ReferenceOperation, right: ReferenceOperation): boolean {
  return (
    sameText(left.name, right.name) &&
    sameOptionalText(left.lede, right.lede) &&
    sameImage(left.image, right.image) &&
    left.announceFrom.getTime() === right.announceFrom.getTime() &&
    (left.orderFrom?.getTime() ?? null) === (right.orderFrom?.getTime() ?? null) &&
    left.orderUntil.getTime() === right.orderUntil.getTime() &&
    left.pickupFrom === right.pickupFrom &&
    left.pickupUntil === right.pickupUntil &&
    left.audience === right.audience &&
    left.skus.length === right.skus.length &&
    left.skus.every((sku, index) => sku === right.skus[index])
  );
}

function sameText(left: OperationText, right: OperationText): boolean {
  return left.fr === right.fr && left.en === right.en && left.it === right.it;
}

function sameOptionalText(left: OperationText | null, right: OperationText | null): boolean {
  return left === null || right === null ? left === right : sameText(left, right);
}

function sameImage(left: ReferenceOperation["image"], right: ReferenceOperation["image"]): boolean {
  return left === null || right === null
    ? left === right
    : left.url === right.url && left.alt === right.alt;
}
