import { PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CategoryUnknownLocationError } from "../domain/errors/category-errors.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { KnownLocationsReader } from "../domain/ports/known-locations.reader.js";
import { SalesContextRegistry } from "../../shared/domain/ports/sales-context.registry.js";
import {
  referencedLocations,
  type SalesChannels,
} from "../../shared/domain/value-objects/sales-channels.js";
import { requireCategory } from "./category-support.js";

export class SetCategoryChannelsCommand {
  constructor(
    readonly id: string,
    readonly channels: SalesChannels,
  ) {}
}

/**
 * Règle où une famille se vend — et **refuse un emplacement qui n'existe pas**.
 *
 * La grille est indexée par identifiant d'emplacement dans une colonne `jsonb` :
 * aucune clé étrangère ne tient cette référence. `DeleteLocation` en tire
 * déjà la conséquence et refuse de supprimer sous une famille qui coche. Rien
 * ne gardait le sens inverse : un preset citant `emp_fantome` était accepté,
 * persisté, puis rendu INVISIBLE par l'écran — qui ignore les clés inconnues.
 * Un mur à une seule face n'est pas un mur.
 */
@CommandHandler(SetCategoryChannelsCommand)
export class SetCategoryChannelsHandler implements ICommandHandler<
  SetCategoryChannelsCommand,
  void
> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly locations: KnownLocationsReader,
    private readonly contexts: SalesContextRegistry,
    private readonly journal: PimJournal,
  ) {}

  async execute(command: SetCategoryChannelsCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    await this.refuseUnknownLocations(command.channels);
    // Le registre décide quels taux tombent avec le canal qu'on ferme : c'est
    // lui qui sait quel contexte s'appuie sur quel canal.
    category.setChannels(command.channels, await this.contexts.active());
    // Dette déclarée (cf. `lint:journal-tracked`) : ce geste n'a pas encore
    // d'événement métier. Le motif est ici, greppable, plutôt que dans un
    // silence qu'on prendrait pour une décision.
    await this.categories.save(
      category,
      this.journal.untraced(
        "canaux de famille — aucun événement métier défini (dette journal-tracked)",
      ),
    );
  }

  private async refuseUnknownLocations(channels: SalesChannels): Promise<void> {
    const cited = referencedLocations(channels);
    const known = await this.locations.existing(cited);
    for (const id of cited) {
      if (!known.has(id)) {
        throw new CategoryUnknownLocationError(id);
      }
    }
  }
}
