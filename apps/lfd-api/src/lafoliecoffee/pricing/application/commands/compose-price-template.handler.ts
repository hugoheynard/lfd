import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { PriceTemplate } from "../../domain/entities/price-template.js";
import { PriceTemplateRepository } from "../../domain/ports/price-template.repository.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { ComposePriceTemplateCommand } from "./compose-price-template.command.js";
import { priceTemplateDraftOf } from "./price-template-draft.js";

/** Le nom stable du geste, dans le registre des intentions. */
const COMPOSE_GESTURE = "pricing.compose-price-template";

/**
 * Compose un gabarit tarifaire neuf et rend son identifiant.
 *
 * **Une fois par intention** : la clé de l'écran est réclamée avant tout et
 * scellée dans la transaction de l'écriture ; un double clic rend le gabarit
 * déjà composé, sans en composer un second. Le sujet est l'empreinte de la
 * grille : la même clé sur une autre grille est refusée (409).
 *
 * @throws les refus de `priceTemplateDraftOf` (référence hors vente).
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour une autre grille.
 */
@CommandHandler(ComposePriceTemplateCommand)
export class ComposePriceTemplateHandler implements ICommandHandler<
  ComposePriceTemplateCommand,
  string
> {
  constructor(
    private readonly templates: PriceTemplateRepository,
    private readonly ids: IdGenerator,
    private readonly references: SaleReferenceReader,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ComposePriceTemplateCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: COMPOSE_GESTURE,
        subject: intentSubject("price-template", command.payload),
      },
      CREATED_ID_REPLAY,
      async (seal) => {
        const draft = await priceTemplateDraftOf(this.references, command.payload);
        const template = PriceTemplate.compose(this.ids.next(), draft, command.staffUserId);
        await this.uow.run(async () => {
          await this.templates.save(template);
          await seal(template.id);
        });
        return template.id;
      },
    );
  }
}
