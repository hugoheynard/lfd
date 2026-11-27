import type { OptionGroupPayload } from "@lfd/pim-contracts";

import { OptionGroupNotFoundError } from "../domain/errors/option-group-errors.js";
import type { OptionGroup, OptionGroupInput } from "../domain/entities/option-group.js";
import { OptionGroupRepository } from "../domain/ports/option-group.repository.js";

/** Charge le groupe, ou refuse. @throws {OptionGroupNotFoundError} */
export async function requireOptionGroup(
  groups: OptionGroupRepository,
  id: string,
): Promise<OptionGroup> {
  const group = await groups.findById(id);
  if (group === null) {
    throw new OptionGroupNotFoundError(id);
  }
  return group;
}

/** Ce que l'agrégat reçoit d'une requête : la forme seule, il valide le reste. */
export function groupInputOf(payload: OptionGroupPayload): OptionGroupInput {
  return {
    name: payload.name,
    choices: payload.choices.map(({ key, label, audience }) => ({ key, label, audience })),
  };
}

/**
 * Ce qu'un fait du journal dit d'un groupe : son nom, et les libellés de ses
 * choix en service dans leur ordre — ce que le client verra.
 */
export function journalStateOf(group: OptionGroup): {
  readonly subjectLabel: string;
  readonly name: string;
  readonly choices: readonly string[];
} {
  const { name, choices } = group.snapshot();
  return {
    subjectLabel: name,
    name,
    choices: choices.filter((choice) => choice.archivedAt === null).map((choice) => choice.label),
  };
}
