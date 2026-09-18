import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { OpenStaffAccess } from "../../invitations/open-staff-access.service.js";
import { staffUserCreatedFact } from "../domain/staff-facts.js";
import { StaffUserRepository } from "../domain/staff-user.repository.js";
import { CreateStaffUserCommand } from "./staff-user.commands.js";

/**
 * Crée un membre de l'équipe **et l'invite dans la foulée**.
 *
 * Créer puis inviter étaient deux gestes, et le second s'oubliait : la fiche
 * existait, la personne n'avait rien reçu, et rien à l'écran ne distinguait
 * « créée » de « invitée ». Or il n'y a pas de membre du staff qu'on
 * enregistre sans vouloir qu'il se connecte — l'invitation EST la création.
 *
 * **La fiche et sa trace partent ensemble** (plan
 * `plan-journal-de-l-annuaire.md` §5) : une panne de journal annule la
 * création. L'ouverture d'accès suit, HORS de la transaction — elle frappe
 * Auth0 et envoie un e-mail —, et c'est elle qui écrit le fait `invited`, s'il
 * aboutit.
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
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateStaffUserCommand): Promise<string> {
    const id = await this.uow.run(async () => {
      const created = await this.staff.create(command.payload, command.actorId);
      await this.journal.append(staffUserCreatedFact(created, command.payload));
      return created;
    });
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
