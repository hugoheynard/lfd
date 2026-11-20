import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { ParticularContactTakenError } from "../../domain/errors/particular-errors.js";
import { ParticularRegistry } from "../../domain/ports/particular-registry.js";
import { ParticularIdentity } from "../../domain/value-objects/particular-identity.js";
import { RegisterCounterParticularCommand } from "./register-counter-particular.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const REGISTER_PARTICULAR_GESTURE = "account.register-counter-particular";
/** La cible de l'intention : une fiche qui n'existe pas encore, donc sans identifiant. */
const NEW_PARTICULAR_TARGET = "new-counter-particular";

/**
 * Inscrit au comptoir une fiche particulier **neuve**, et seulement neuve.
 *
 * Si l'adresse ou le téléphone répond déjà à un particulier, le geste est
 * refusé en nommant la fiche : l'équipe la choisit dans la recherche. Jamais
 * de rattachement silencieux — c'est toute la différence avec l'invité de la
 * boutique, retrouvé par son adresse.
 *
 * **Une fois par intention** : la clé de l'écran est scellée dans la
 * transaction de l'écriture ; un double envoi rend la fiche déjà créée, sans
 * seconde fiche. Le sujet ne range aucune coordonnée, seulement son empreinte.
 *
 * @throws {ParticularContactTakenError} l'adresse ou le téléphone est déjà celui d'un particulier.
 * @throws {InvalidEmailError | InvalidPersonNameError | InvalidPhoneError} saisie invalide.
 */
@CommandHandler(RegisterCounterParticularCommand)
export class RegisterCounterParticularHandler implements ICommandHandler<
  RegisterCounterParticularCommand,
  string
> {
  constructor(
    private readonly registry: ParticularRegistry,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: RegisterCounterParticularCommand): Promise<string> {
    const identity = ParticularIdentity.declare(command.identity);
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: REGISTER_PARTICULAR_GESTURE,
        subject: intentSubject(NEW_PARTICULAR_TARGET, {
          firstName: identity.firstName.value,
          email: identity.email.value,
          phoneKey: identity.phoneKey,
        }),
      },
      CREATED_ID_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const holder = await this.registry.holderOf(identity);
          if (holder !== null) {
            throw new ParticularContactTakenError(holder.id, holder.firstName, holder.taken);
          }
          const id = await this.registry.register(identity, command.staffUserId);
          await seal(id);
          return id;
        }),
    );
  }
}
