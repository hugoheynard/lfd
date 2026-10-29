import { InvalidMinQuantityError } from "../errors/min-quantity-errors.js";

/**
 * Les deux lignes de la matrice : à qui la fiche vend
 * (`documentation/catalogue/plan-quantite-minimale.md`, Q2). `both` n'en est
 * pas une — une fiche « les deux » règle chacune de ses deux clientèles.
 */
export type MinQuantityAudience = "pro" | "public";

export const MIN_QUANTITY_AUDIENCES: readonly MinQuantityAudience[] = ["pro", "public"];

/** Le plus petit minimum qui dise quelque chose : 1 est l'absence de minimum (Q3). */
export const MIN_QUANTITY_FLOOR = 2;

/**
 * **La quantité minimale d'achat d'une déclinaison**, en pièces — une matrice
 * audience × contexte de vente, chaque contexte désigné par sa CLÉ (`takeaway`,
 * `b2b`) : c'est elle qui voyage sur le fil, comme `publicByContext`.
 *
 * Une case absente = pas de minimum pour cette clientèle dans ce contexte.
 */
export interface MinQuantities {
  readonly pro: Readonly<Record<string, number>>;
  readonly public: Readonly<Record<string, number>>;
}

/** Ce que naît toute déclinaison, et ce qu'est tout l'existant : aucun minimum. */
export const NO_MIN_QUANTITIES: MinQuantities = { pro: {}, public: {} };

/**
 * Lit une matrice — valide ou rien : des entiers ≥ {@link MIN_QUANTITY_FLOOR}.
 *
 * Le contexte, lui, se vérifie contre le registre, que seul l'agrégat voit
 * (`Product.changeMinQuantities`) : la forme ne sait pas quels contextes
 * existent.
 *
 * @throws {InvalidMinQuantityError} une case n'est pas un entier ≥ 2.
 */
export function minQuantities(input: MinQuantities): MinQuantities {
  return { pro: rowOf("pro", input.pro), public: rowOf("public", input.public) };
}

function rowOf(
  audience: MinQuantityAudience,
  row: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  for (const [contextKey, quantity] of Object.entries(row)) {
    if (!Number.isSafeInteger(quantity) || quantity < MIN_QUANTITY_FLOOR) {
      throw new InvalidMinQuantityError(audience, contextKey, quantity);
    }
  }
  return { ...row };
}

/** Les clés de contexte qu'une matrice nomme, toutes lignes confondues. */
export function contextKeysOf(matrix: MinQuantities): readonly string[] {
  return [...new Set([...Object.keys(matrix.pro), ...Object.keys(matrix.public)])];
}

/** Deux matrices disent-elles la même chose ? L'ordre des clés n'y compte pas. */
export function sameMinQuantities(left: MinQuantities, right: MinQuantities): boolean {
  return MIN_QUANTITY_AUDIENCES.every((audience) => sameRow(left[audience], right[audience]));
}

function sameRow(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

/** Une matrice vide ne règle rien. */
export function isEmptyMinQuantities(matrix: MinQuantities): boolean {
  return contextKeysOf(matrix).length === 0;
}
