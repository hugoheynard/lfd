import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ContactPhone } from "../../domain/contact-phone.js";
import { ContactPhoneRepository } from "../../domain/ports/contact-phone.repository.js";
import { CreateContactPhoneCommand } from "./create-contact-phone.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "contact.create-phone";

/**
 * Crée un numéro de contact ; le numéro refuse lui-même un libellé ou un
 * numéro invalide.
 *
 * @sans-journal un réglage d'écran sans règle de refus métier, comme les objets.
 */
@CommandHandler(CreateContactPhoneCommand)
export class CreateContactPhoneHandler implements ICommandHandler<
  CreateContactPhoneCommand,
  string
> {
  constructor(
    private readonly phones: ContactPhoneRepository,
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
  execute(command: CreateContactPhoneCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject("phone", command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const phone = ContactPhone.create({
            ...command.payload,
            id: this.ids.next(),
            at: this.clock.now(),
          });
          await this.phones.save(phone);
          await seal(phone.id);
          return phone.id;
        }),
    );
  }
}
