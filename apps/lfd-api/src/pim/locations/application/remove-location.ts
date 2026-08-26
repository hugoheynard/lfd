import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { LocationRepository } from "../domain/ports/location.repository.js";
import { requireLocation } from "./location-support.js";

export class RemoveLocationCommand {
  constructor(readonly id: string) {}
}

/**
 * Supprime un emplacement — **sauf** si des familles le citent encore.
 *
 * Le refus n'est plus prononcé ici. Il l'était : compter les familles, puis
 * supprimer si le compte était nul. Deux instants, donc une fenêtre — une
 * grille pouvait se mettre à citer l'emplacement entre les deux, et la famille
 * se retrouvait à pointer un point de vente disparu, sans erreur.
 *
 * Les canaux d'une gamme référencent l'emplacement dans une colonne `jsonb`, où
 * aucune clé étrangère ne se pose. C'est `category_location_ref` — l'index que
 * le dépôt des familles écrit dans la même transaction que la colonne — qui
 * porte le `Restrict`, et le dépôt des emplacements qui le traduit en
 * `LocationInUseError`.
 */
@CommandHandler(RemoveLocationCommand)
export class RemoveLocationHandler implements ICommandHandler<RemoveLocationCommand, void> {
  constructor(
    private readonly locations: LocationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveLocationCommand): Promise<void> {
    const location = await requireLocation(this.locations, command.id);
    const { name, tables } = location.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.locationDeleted,
        subjectType: "location",
        subjectId: command.id,
        // Après elle, la ligne n'est plus interrogeable : le journal est le
        // seul endroit où l'emplacement a encore un nom. On y verse donc le
        // nom ET le nombre de tables — c'est-à-dire combien de QR imprimés
        // viennent de cesser d'ouvrir quoi que ce soit.
        payload: { name, tableCount: tables.length },
      });
      await this.locations.remove(command.id, ticket);
    });
  }
}
