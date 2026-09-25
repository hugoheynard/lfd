import { InvalidCatalogOperationAudienceError } from "./errors/catalog-operation-errors.js";

/**
 * **À qui une opération s'adresse** (D7) — tel que le référentiel l'a décidé,
 * ou tel que la réception l'a restreint (D9).
 *
 * Déclaré ICI plutôt qu'importé du fil ou du référentiel : le domaine du
 * commerce décrit ce qu'il tient, pas la forme de qui le lui a dit.
 */
export const CATALOG_OPERATION_AUDIENCES = ["pro", "public", "both"] as const;
export type CatalogOperationAudience = (typeof CATALOG_OPERATION_AUDIENCES)[number];

/**
 * La clientèle **appliquée**, après surcharge : l'une des trois, ou
 * **personne** — une intersection vide (le référentiel est passé aux
 * particuliers alors que la réception avait restreint aux professionnels).
 * Un nom plutôt qu'un `null` : « personne » est un résultat, pas un silence.
 */
export type EffectiveOperationAudience = CatalogOperationAudience | "none";

/** @throws {InvalidCatalogOperationAudienceError} la valeur n'est pas l'une des trois. */
export function catalogOperationAudience(raw: string): CatalogOperationAudience {
  const found = CATALOG_OPERATION_AUDIENCES.find((audience) => audience === raw);
  if (found === undefined) {
    throw new InvalidCatalogOperationAudienceError(raw);
  }
  return found;
}

/** Ce que chaque clientèle atteint. `both` n'est pas une troisième population. */
const REACH: Readonly<Record<CatalogOperationAudience, readonly ("pro" | "public")[]>> = {
  pro: ["pro"],
  public: ["public"],
  both: ["pro", "public"],
};

/**
 * **L'intersection** de la clientèle du référentiel et de celle de la
 * réception — restreindre, jamais élargir (D7, D9). `null` côté réception = on
 * garde celle du référentiel.
 */
export function intersectAudiences(
  received: CatalogOperationAudience,
  restricted: CatalogOperationAudience | null,
): EffectiveOperationAudience {
  if (restricted === null) {
    return received;
  }
  const kept = REACH[received].filter((population) => REACH[restricted].includes(population));
  if (kept.length === 2) {
    return "both";
  }
  return kept[0] ?? "none";
}
