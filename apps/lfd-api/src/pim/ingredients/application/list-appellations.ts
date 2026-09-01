import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { AppellationView } from "@lfd/pim-contracts";

import {
  AppellationRepository,
  type AppellationRecord,
} from "../domain/ports/appellation.repository.js";

/** Le référentiel des signes officiels **entier**, pour l'écran qui l'administre. Sans paramètre. */
export class ListAppellationsQuery {}

/**
 * Ce que l'écran des provenances lit dans sa colonne « appellations ».
 *
 * Il ne filtre **rien** — les appellations hors service comprises : c'est
 * depuis cet écran qu'on les remet en service, et une ligne qu'on ne voit pas
 * est une ligne qu'on ne peut plus rouvrir.
 */
@QueryHandler(ListAppellationsQuery)
export class ListAppellationsHandler implements IQueryHandler<
  ListAppellationsQuery,
  AppellationView[]
> {
  constructor(private readonly appellations: AppellationRepository) {}

  async execute(): Promise<AppellationView[]> {
    const records = await this.appellations.list();
    return records.map(toAppellationView);
  }
}

/** L'identifiant technique ne sort pas : le fil parle en codes et en clés. */
function toAppellationView(record: AppellationRecord): AppellationView {
  return {
    code: record.code,
    label: record.label,
    scheme: record.scheme,
    active: record.active,
    usedBy: record.usedBy,
  };
}
