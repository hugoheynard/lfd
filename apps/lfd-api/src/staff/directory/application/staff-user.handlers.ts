import { Inject, Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MAILER, type B2bMailer } from "../../../platform/mailer/mailer.tokens.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import { StaffIdentityPort } from "../../invitations/staff-identity.port.js";
import { StaffUserRepository, type StaffIdentityFacts } from "../domain/staff-user.repository.js";
import { OpenStaffAccess } from "../../invitations/open-staff-access.service.js";
import { SetStaffStatusCommand } from "./set-staff-status.command.js";
import {
  CreateStaffUserCommand,
  RemoveStaffUserCommand,
  UpdateStaffUserCommand,
} from "./staff-user.commands.js";

/**
 * Handlers **staff** de l'annuaire. Minces : ils délèguent au repository, qui
 * rassemble les faits et laisse la politique de domaine trancher
 * (`staff-access.policy.ts`). Le mur d'entrée est l'`AdminAuthGuard` sur la route.
 */

/**
 * Crée un membre de l'équipe **et l'invite dans la foulée**.
 *
 * Créer puis inviter étaient deux gestes, et le second s'oubliait : la fiche
 * existait, la personne n'avait rien reçu, et rien à l'écran ne distinguait
 * « créée » de « invitée ». Or il n'y a pas de membre du staff qu'on
 * enregistre sans vouloir qu'il se connecte — l'invitation EST la création.
 *
 * **L'échec de l'invitation ne défait jamais la fiche.** Si le fournisseur
 * d'identité ou le courrier tombe, la personne existe quand même dans
 * l'annuaire et « Renvoyer le lien » reprend la main. L'inverse perdrait une
 * saisie pour une panne de canal, et ne laisserait rien à rattraper.
 */
@CommandHandler(CreateStaffUserCommand)
export class CreateStaffUserHandler implements ICommandHandler<CreateStaffUserCommand, string> {
  private readonly logger = new Logger(CreateStaffUserHandler.name);

  constructor(
    private readonly staff: StaffUserRepository,
    private readonly access: OpenStaffAccess,
  ) {}

  async execute(command: CreateStaffUserCommand): Promise<string> {
    const id = await this.staff.create(command.payload, command.actorSub);
    try {
      await this.access.open(id);
    } catch (error) {
      this.logger.error(
        `Membre ${id} créé, mais son invitation n'est pas partie — à renvoyer depuis sa fiche.`,
        error,
      );
    }
    return id;
  }
}

/**
 * Édite une fiche, **et tient l'adresse de connexion alignée**.
 *
 * Sans le second geste, renommer quelqu'un dans l'annuaire le laissait se
 * connecter avec son ancienne adresse pendant que l'écran en affichait une
 * autre — la liaison par `sub` lui gardait son accès, mais l'application
 * mentait.
 *
 * **L'ordre est un compromis assumé.** On écrit d'abord chez nous, parce que
 * c'est l'écriture locale qui fait tourner la politique de domaine : propager
 * avant validerait chez Auth0 un changement que la règle de l'admin racine peut
 * encore refuser. Le risque résiduel — écriture locale faite, propagation
 * échouée — est donc **tracé explicitement avec les deux adresses**, pour qu'il
 * soit réparable plutôt que découvert six mois plus tard.
 */
@CommandHandler(UpdateStaffUserCommand)
export class UpdateStaffUserHandler implements ICommandHandler<UpdateStaffUserCommand, void> {
  private readonly logger = new Logger(UpdateStaffUserHandler.name);

  constructor(
    private readonly staff: StaffUserRepository,
    private readonly identities: StaffIdentityPort,
  ) {}

  async execute(command: UpdateStaffUserCommand): Promise<void> {
    const before = await this.staff.identityOf(command.id);
    await this.staff.update(command.id, command.payload, command.actorSub);
    await this.propagateEmail(before, command.payload.email);
  }

  /**
   * Propage l'adresse **uniquement** si elle a bougé et qu'une identité existe.
   *
   * Une fiche jamais liée n'a rien à propager : son adresse servira au premier
   * rapprochement, et l'invitation ouvrira l'identité avec la bonne.
   */
  private async propagateEmail(before: StaffIdentityFacts, next: string): Promise<void> {
    const wanted = next.trim().toLowerCase();
    if (before.auth0Id === null || wanted === before.email) {
      return;
    }
    try {
      await this.identities.changeEmail(before.auth0Id, wanted);
    } catch (error) {
      this.logger.error(
        `Adresse désynchronisée pour ${before.auth0Id} : annuaire=${wanted}, ` +
          `fournisseur=${before.email}. À reprendre à la main.`,
        error,
      );
      throw error;
    }
  }
}

@CommandHandler(RemoveStaffUserCommand)
export class RemoveStaffUserHandler implements ICommandHandler<RemoveStaffUserCommand, void> {
  constructor(private readonly staff: StaffUserRepository) {}

  async execute(command: RemoveStaffUserCommand): Promise<void> {
    await this.staff.remove(command.id, command.actorSub);
  }
}

/**
 * Suspend ou réintègre — **et le dit à la personne concernée**.
 *
 * Sans cet e-mail, elle apprenait la fermeture de son accès en se heurtant à un
 * refus de connexion, sans savoir si c'était une panne, une erreur de mot de
 * passe ou une décision. Un refus muet fait ouvrir un ticket ; une phrase
 * évite le ticket et la mauvaise interprétation.
 *
 * L'envoi ne conditionne PAS la transition : suspendre est une décision de
 * sécurité, et un fournisseur d'e-mail en panne ne doit jamais laisser une
 * porte ouverte. On ferme, puis on prévient.
 */
@CommandHandler(SetStaffStatusCommand)
export class SetStaffStatusHandler implements ICommandHandler<SetStaffStatusCommand, void> {
  private readonly logger = new Logger(SetStaffStatusHandler.name);

  constructor(
    private readonly staff: StaffUserRepository,
    private readonly config: AppConfig,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async execute(command: SetStaffStatusCommand): Promise<void> {
    await this.staff.setStatus(command.id, command.change, command.actorSub);
    await this.tell(command.id, command.change.status);
  }

  private async tell(id: string, status: "active" | "suspended"): Promise<void> {
    try {
      const target = await this.staff.identityOf(id);
      await (status === "suspended"
        ? this.mailer.send({
            to: target.email,
            template: "staff.access-suspended",
            data: { firstName: target.firstName },
          })
        : this.mailer.send({
            to: target.email,
            template: "staff.access-restored",
            data: {
              firstName: target.firstName,
              backOfficeUrl: this.config.adminBaseUrl() ?? "",
            },
          }));
    } catch (error) {
      this.logger.error(`Changement d'accès non notifié à ${id} (statut ${status}).`, error);
    }
  }
}
