import { OPERATION_AUDIENCES, type OperationAudience } from "@lfd/pim-contracts";

import { InvalidOperationAudienceError } from "../errors/operation-errors.js";

export type { OperationAudience };

/**
 * **À qui l'opération s'adresse** (D7) : professionnels, particuliers, ou les
 * deux. Revalidé ici parce qu'une ligne relue de la base n'est pas passée par
 * le contrat.
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
