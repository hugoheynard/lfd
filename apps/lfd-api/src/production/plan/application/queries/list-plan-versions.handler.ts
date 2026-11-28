import type { PlanVersionAuthorView, PlanVersionView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StaffContacts } from "../../../../staff/directory/domain/staff-contacts.js";
import { PlanVersionListing, ServiceDay } from "../../../day/index.js";
import { PlanVersionPaperShelf } from "../services/plan-version-paper-shelf.js";
import { ListPlanVersionsQuery } from "./list-plan-versions.query.js";

type PlanVersionEntry = Awaited<ReturnType<PlanVersionListing["listOf"]>>[number];

/**
 * **La liste des versions du plan d'une journée**
 * (`documentation/fournil/plan-historique-des-tirages.md`, lot H4) : les
 * versions que le noyau garde, l'auteur nommé, et « papier rangé ou non »
 * lu au stockage (§ 1.12). Une journée jamais versionnée rend une liste vide.
 *
 * Le nom d'un auteur du staff est celui figé au geste ; à défaut (une
 * révision ou un retrait, que le commerce signe sans nom), celui de
 * l'annuaire aujourd'hui ; à défaut, `null`.
 */
@QueryHandler(ListPlanVersionsQuery)
export class ListPlanVersionsHandler implements IQueryHandler<
  ListPlanVersionsQuery,
  readonly PlanVersionView[]
> {
  constructor(
    private readonly listing: PlanVersionListing,
    private readonly shelf: PlanVersionPaperShelf,
    private readonly staff: StaffContacts,
  ) {}

  async execute(query: ListPlanVersionsQuery): Promise<readonly PlanVersionView[]> {
    const entries = await this.listing.listOf(ServiceDay.of(query.serviceDay));
    if (entries.length === 0) {
      return [];
    }
    const [names, papers] = await Promise.all([
      this.directoryNamesOf(entries),
      this.shelf.papersOf(
        query.serviceDay,
        entries.filter((entry) => entry.paperVersion === entry.version),
      ),
    ]);
    return entries.map((entry) => ({
      version: entry.version,
      cause: entry.cause,
      recordedAt: entry.recordedAt.toISOString(),
      author: authorOf(entry.recordedBy, names),
      closedAt: entry.closedAt.toISOString(),
      printRun: entry.printRun,
      shipmentCount: entry.shipmentCount,
      paper: papers.of(entry.paperVersion),
    }));
  }

  /** Les noms de l'annuaire des seuls auteurs du staff dont le geste n'a pas figé le nom. */
  private async directoryNamesOf(
    entries: readonly PlanVersionEntry[],
  ): Promise<ReadonlyMap<string, string>> {
    const ids = new Set(
      entries.flatMap(({ recordedBy: by }) =>
        by.kind === "staff" && by.name === null ? [by.staffId] : [],
      ),
    );
    if (ids.size === 0) {
      return new Map();
    }
    const cards = await this.staff.contactsOf([...ids]);
    return new Map(
      [...cards.values()].flatMap((card) => {
        const name = `${card.firstName} ${card.lastName}`.trim();
        return name === "" ? [] : [[card.staffUserId, name] as const];
      }),
    );
  }
}

function authorOf(
  by: PlanVersionEntry["recordedBy"],
  directory: ReadonlyMap<string, string>,
): PlanVersionAuthorView {
  if (by.kind !== "staff") {
    return { kind: by.kind };
  }
  return { kind: "staff", staffId: by.staffId, name: by.name ?? directory.get(by.staffId) ?? null };
}
