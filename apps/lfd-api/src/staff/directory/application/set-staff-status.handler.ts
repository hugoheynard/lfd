import { Inject, Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../platform/config/app-config.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { MAILER, type B2bMailer } from "../../../platform/mailer/mailer.tokens.js";
import { StaffAccessCache } from "../../permissions/staff-access-cache.port.js";
import { staffStatusFact } from "../domain/staff-facts.js";
import type { StaffUserSnapshot } from "../domain/staff-user-state.js";
import { StaffUserRepository } from "../domain/staff-user.repository.js";
import { SetStaffStatusCommand } from "./set-staff-status.command.js";

/**
 * Suspend ou réintègre — **et le dit à la personne concernée**.
 *
 * Sans cet e-mail, elle apprenait la fermeture de son accès en se heurtant à un
 * refus de connexion, sans savoir si c'était une panne, une erreur de mot de
 * passe ou une décision. Un refus muet fait ouvrir un ticket ; une phrase
 * évite le ticket et la mauvaise interprétation.
 *
 * La porte se ferme **avec sa trace**, dans la même transaction. Le cache
 * d'accès est oublié juste APRÈS le commit : vidé avant, une requête
 * concurrente le remplirait avec l'état d'avant, et la suspension mettrait
 * trente secondes à mordre.
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
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly cache: StaffAccessCache,
  ) {}

  async execute(command: SetStaffStatusCommand): Promise<void> {
    const { status } = command.change;
    const before = await this.uow.run(async () => {
      const previous = await this.staff.setStatus(command.id, command.change, command.actorId);
      const fact = staffStatusFact(command.id, previous, previous.status, status);
      if (fact !== null) {
        await this.journal.append(fact);
      }
      return previous;
    });
    this.cache.forgetAll();
    await this.tell(before, status);
  }

  private async tell(target: StaffUserSnapshot, status: "active" | "suspended"): Promise<void> {
    try {
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
      this.logger.error(`Changement d'accès non notifié à ${target.id} (statut ${status}).`, error);
    }
  }
}
