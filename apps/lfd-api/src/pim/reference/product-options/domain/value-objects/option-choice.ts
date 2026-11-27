import { OPERATION_AUDIENCES, type OperationAudience } from "@lfd/pim-contracts";

import {
  EmptyOptionChoiceLabelError,
  InvalidOptionChoiceAudienceError,
  InvalidOptionChoiceKeyError,
} from "../errors/option-group-errors.js";

/** À qui un choix se propose : les pros, les particuliers, les deux. */
export type OptionAudience = OperationAudience;

/** Minuscules sans accent, chiffres, tirets entre deux mots. */
const KEY_FORM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const KEY_MAX_LENGTH = 40;

/** Ce qu'un choix dit de lui-même, sans son rang ni son archive. */
export interface OptionChoiceInput {
  readonly key: string;
  readonly label: string;
  readonly audience: string;
}

/** Un choix, tel que le groupe le garde. */
export interface OptionChoiceSnapshot {
  readonly key: string;
  readonly label: string;
  readonly audience: OptionAudience;
  /** Le rang dans le groupe, à partir de 0. */
  readonly position: number;
  /** `null` = en service. */
  readonly archivedAt: Date | null;
}

/**
 * Valide la clé d'un choix : son identité dans le groupe, gardée par les
 * commandes.
 *
 * @throws {InvalidOptionChoiceKeyError} la clé n'a pas la forme attendue.
 */
export function optionChoiceKey(raw: string): string {
  const key = raw.trim();
  if (key.length > KEY_MAX_LENGTH || !KEY_FORM.test(key)) {
    throw new InvalidOptionChoiceKeyError(raw);
  }
  return key;
}

/**
 * Valide un choix reçu — d'une requête ou d'une ligne relue.
 *
 * @throws {InvalidOptionChoiceKeyError} la clé n'a pas la forme attendue.
 * @throws {EmptyOptionChoiceLabelError} le libellé est vide.
 * @throws {InvalidOptionChoiceAudienceError} la clientèle est inconnue.
 */
export function optionChoice(
  input: OptionChoiceInput,
  position: number,
  archivedAt: Date | null,
): OptionChoiceSnapshot {
  const key = optionChoiceKey(input.key);
  const label = input.label.trim();
  if (label === "") {
    throw new EmptyOptionChoiceLabelError(key);
  }
  return { key, label, audience: optionAudience(input.audience), position, archivedAt };
}

/** @throws {InvalidOptionChoiceAudienceError} la valeur n'est pas l'une des trois. */
export function optionAudience(raw: string): OptionAudience {
  const found = OPERATION_AUDIENCES.find((candidate) => candidate === raw);
  if (found === undefined) {
    throw new InvalidOptionChoiceAudienceError(raw);
  }
  return found;
}
