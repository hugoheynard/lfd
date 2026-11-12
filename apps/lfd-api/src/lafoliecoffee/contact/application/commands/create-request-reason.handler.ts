import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { RequestReason } from "../../domain/request-reason.js";
import { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";
import { CreateRequestReasonCommand } from "./create-request-reason.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "contact.create-request-reason";

/**
 * Crée un motif. Le motif refuse lui-même un type inconnu, un libellé
 * français vide ou une adresse invalide.
 *
 * @sans-journal un réglage d'écran sans règle de refus métier au-delà de la
 * validité ; seul le traitement d'une demande est un fait journalisé.
 */
@CommandHandler(CreateRequestReasonCommand)
export class CreateRequestReasonHandler implements ICommandHandler<
  CreateRequestReasonCommand,
  string
> {
  constructor(
    private readonly reasons: RequestReasonRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est scellée avec
   * l'écriture ; un double clic rend la ligne déjà créée, sans en créer une
   * seconde.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour une autre création.
   */
  execute(command: CreateRequestReasonCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject("reason", command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const reason = RequestReason.create({
            ...command.payload,
            id: this.ids.next(),
            at: this.clock.now(),
          });
          await this.reasons.save(reason);
          await seal(reason.id);
          return reason.id;
        }),
    );
  }
}
