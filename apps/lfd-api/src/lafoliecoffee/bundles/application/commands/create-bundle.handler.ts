import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { Bundle } from "../../domain/entities/bundle.js";
import { BundleKeyTakenError } from "../../domain/errors/bundle-errors.js";
import { BundleCreatedEvent } from "../../domain/events/bundle.events.js";
import { BundleChoiceCatalogue } from "../../domain/ports/bundle-choice.catalogue.js";
import { BundleRepository } from "../../domain/ports/bundle.repository.js";
import { admitChoices } from "../../domain/services/admit-choices.js";
import { choicesOf } from "../../domain/value-objects/bundle-composition.js";
import { subjectOf } from "./bundle-writing.js";
import { CreateBundleCommand } from "./create-bundle.command.js";

/**
 * **Crée** une formule en brouillon, pour le public (D4 : seule clientèle
 * admise dans ce lot).
 *
 * L'agrégat naît d'abord — il juge la composition et tire la clé du nom —,
 * puis chaque article est admis au catalogue (§4.2), puis la clé est
 * confrontée aux autres. La lecture donne le message ; l'index unique tient
 * la course entre deux onglets.
 */
@CommandHandler(CreateBundleCommand)
export class CreateBundleHandler implements ICommandHandler<CreateBundleCommand, string> {
  constructor(
    private readonly bundles: BundleRepository,
    private readonly catalogue: BundleChoiceCatalogue,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateBundleCommand): Promise<string> {
    const bundle = Bundle.create(
      { id: this.ids.next(), audience: "public", ...command.bundle },
      { by: command.writtenBy, at: this.clock.now() },
    );
    const created = bundle.snapshot();
    const skus = choicesOf(created.groups);
    admitChoices(skus, await this.catalogue.articlesAmong(skus));
    if ((await this.bundles.load(created.key)) !== null) {
      throw new BundleKeyTakenError(created.key);
    }

    await this.uow.run(async () => {
      await this.bundles.add(bundle);
      await this.events.publishTraced(new BundleCreatedEvent(subjectOf(created), created));
    });
    return created.key;
  }
}
