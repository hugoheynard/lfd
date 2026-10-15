import { InvalidOperationAudienceError } from "../errors/operation-errors.js";

/**
 * **À qui l'opération s'adresse** (D7) : professionnels, particuliers, ou les
 * deux. Déclaré ici plutôt qu'importé du contrat ou du miroir : le domaine
 * décrit ce qu'il tient, pas la forme de qui le lui a dit.
 */
export const OPERATION_AUDIENCES = ["pro", "public", "both"] as const;
export type OperationAudience = (typeof OPERATION_AUDIENCES)[number];

/**
 * Revalidé ici parce qu'une ligne relue de la base n'est pas passée par le contrat.
 *
 * @throws {InvalidOperationAudienceError} la valeur n'est pas l'une des trois.
 */
export function operationAudience(raw: string): OperationAudience {
  const found = OPERATION_AUDIENCES.find((audience) => audience === raw);
  if (found === undefined) {
    throw new InvalidOperationAudienceError(raw);
  }
  return found;
}
