import { OPERATION_AUDIENCES, type OperationAudience } from "@lfd/pim-contracts";

import { InvalidAudienceError } from "../errors/audience-errors.js";

/**
 * **À qui l'on vend** : professionnels, particuliers, ou les deux (C2 du plan
 * `plan-catalogue-synchronise-par-audience.md`).
 *
 * Le type est celui des opérations datées, et ce n'est pas un hasard : une
 * fiche et une opération s'adressent aux mêmes clientèles, et deux listes
 * finiraient par ne plus dire la même chose.
 */
export type Audience = OperationAudience;

/**
 * Valide une clientèle reçue — d'une requête ou d'une ligne relue.
 *
 * @throws {InvalidAudienceError} la valeur n'est pas l'une des trois.
 */
export function audience(raw: string): Audience {
  const found = OPERATION_AUDIENCES.find((candidate) => candidate === raw);
  if (found === undefined) {
    throw new InvalidAudienceError(raw);
  }
  return found;
}

/**
 * La clientèle **réelle** d'une fiche : la sienne si elle en a posé une, celle
 * de sa famille sinon.
 *
 * Écrite une fois, ici : c'est elle qui décidera ce qui se vend à qui, et deux
 * copies finiraient par ne plus répondre la même chose.
 */
export function effectiveAudience(
  productAudience: Audience | null,
  categoryAudience: Audience,
): Audience {
  return productAudience ?? categoryAudience;
}

/**
 * Les clientèles qu'une audience **sert**, une par une — `both` en sert deux.
 * C'est la liste à juger pour savoir si chacune peut être facturée.
 */
export function servedAudiences(value: Audience): readonly Exclude<Audience, "both">[] {
  return value === "both" ? ["pro", "public"] : [value];
}
