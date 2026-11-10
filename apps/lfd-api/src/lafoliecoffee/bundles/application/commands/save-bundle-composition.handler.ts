import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BundleCompositionSavedEvent, journalGroups } from "../../domain/events/bundle.events.js";
import { BundleChoiceCatalogue } from "../../domain/ports/bundle-choice.catalogue.js";
import { BundleRepository } from "../../domain/ports/bundle.repository.js";
import { admitChoices } from "../../domain/services/admit-choices.js";
import { requireBundle, subjectOf } from "./bundle-writing.js";
import { SaveBundleCompositionCommand } from "./save-bundle-composition.command.js";

/**
 * **Enregistre la composition** d'une formule.
 *
 * Une seule commande pour tous les gestes de l'éditeur (ajouter, retirer,
 * renommer, réordonner un groupe ou un choix) : l'écran envoie l'état voulu,
 * et `Bundle.recompose` le juge en entier. Des commandes geste par geste
 * traverseraient des états que l'invariant refuse — une formule a toujours
 * deux groupes, et en remplacer un demanderait d'en avoir un seul un instant.
 *
 * Seuls les articles AJOUTÉS sont admis au catalogue (§4.2, « à
 * l'enregistrement d'un choix ») : un article masqué depuis qu'il est dans la
 * formule ne bloque pas le renommage d'un groupe — l'écran le signale.
 */
@CommandHandler(SaveBundleCompositionCommand)
export class SaveBundleCompositionHandler implements ICommandHandler<
  SaveBundleCompositionCommand,
  void
> {
  constructor(
    private readonly bundles: BundleRepository,
    private readonly catalogue: BundleChoiceCatalogue,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SaveBundleCompositionCommand): Promise<void> {
    const bundle = await requireBundle(this.bundles, command.key);
    const before = bundle.snapshot();
    const added = bundle.choicesAddedBy(command.groups);
    bundle.recompose(command.groups, { by: command.writtenBy, at: this.clock.now() });
    admitChoices(added, await this.catalogue.articlesAmong(added));
    const after = bundle.snapshot();
    if (
      JSON.stringify(journalGroups(before.groups)) === JSON.stringify(journalGroups(after.groups))
    ) {
      return;
    }

    await this.uow.run(async () => {
      await this.bundles.save(bundle);
      await this.events.publishTraced(
        new BundleCompositionSavedEvent(subjectOf(after), before.groups, after.groups),
      );
    });
  }
}
