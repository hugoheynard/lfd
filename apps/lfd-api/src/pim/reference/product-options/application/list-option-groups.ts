import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { OptionGroupView } from "@lfd/pim-contracts";

import type { OptionGroup } from "../domain/entities/option-group.js";
import { OptionGroupHoldersReader } from "../domain/ports/option-group-holders.reader.js";
import { OptionGroupRepository } from "../domain/ports/option-group.repository.js";

/** Lecture des groupes d'options, archivés compris — c'est d'ici qu'on les restaure. */
export class ListOptionGroupsQuery {}

/**
 * Rend un modèle de lecture : la vue porte en plus le nombre de fiches qui
 * activent chaque groupe, pour prévenir avant une archive. Lue en base, hors
 * du numéro `pim` : le compte se lit sur une table qu'il ne couvre pas.
 */
@QueryHandler(ListOptionGroupsQuery)
export class ListOptionGroupsHandler implements IQueryHandler<
  ListOptionGroupsQuery,
  OptionGroupView[]
> {
  constructor(
    private readonly groups: OptionGroupRepository,
    private readonly holders: OptionGroupHoldersReader,
  ) {}

  async execute(): Promise<OptionGroupView[]> {
    const [groups, counts] = await Promise.all([
      this.groups.listAll(),
      this.holders.countByGroup(),
    ]);
    return groups.map((group) => viewOf(group, counts.get(group.id) ?? 0));
  }
}

function viewOf(group: OptionGroup, products: number): OptionGroupView {
  const { id, name, choices, archivedAt } = group.snapshot();
  return {
    id,
    name,
    archived: archivedAt !== null,
    choices: choices.map(({ key, label, audience, archivedAt: choiceArchivedAt }) => ({
      key,
      label,
      audience,
      archived: choiceArchivedAt !== null,
    })),
    products,
  };
}
