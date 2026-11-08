import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Mail } from "../../../mail/channels/requests/mail.js";
import { AppConfig } from "../../../platform/config/app-config.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { Journal } from "../../../platform/journal/journal.js";
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
 * La porte se ferme **avec sa trace et la demande d'e-mail**, dans la même
 * transaction (`send` du bloc `mail`, plan `plan-service-e-mails.md`,
 * S2g) : aucun écran ne lit l'issue de l'envoi, et l'e-mail part après la
 * validation, relancé par le balayeur. Le cache d'accès est oublié juste APRÈS
 * le commit : vidé avant, une requête concurrente le remplirait avec l'état
 * d'avant, et la suspension mettrait trente secondes à mordre.
 *
 * Le fournisseur d'e-mail ne conditionne toujours PAS la transition :
 * suspendre est une décision de sécurité, et la demande n'est qu'une écriture
 * de plus dans la même base — Resend en panne retarde l'e-mail, il ne laisse
 * aucune porte ouverte.
 */
@CommandHandler(SetStaffStatusCommand)
export class SetStaffStatusHandler implements ICommandHandler<SetStaffStatusCommand, void> {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly config: AppConfig,
    private readonly mail: Mail,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly cache: StaffAccessCache,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** (plan `plan-service-e-mails.md`, revue, cas
   * 4) : un double clic ne repasse pas la transition et ne redemande pas
   * l'e-mail.
   */
  execute(command: SetStaffStatusCommand): Promise<void> {
    return this.intents.run(
      {
        actorId: command.actorId,
        key: command.intentKey,
        gesture: "staff.set-status",
        subject: `${command.id}:${command.change.status}`,
      },
      NOTHING_TO_REPLAY,
      () => this.apply(command),
    );
  }

  private async apply(command: SetStaffStatusCommand): Promise<void> {
    const { status } = command.change;
    await this.uow.run(async () => {
      const previous = await this.staff.setStatus(command.id, command.change, command.actorId);
      const fact = staffStatusFact(command.id, previous, previous.status, status);
      if (fact !== null) {
        await this.journal.append(fact);
      }
      await this.tell(command, previous, status);
    });
    this.cache.forgetAll();
  }

  /**
   * Une clé par **intention** (la clé de l'écran, revue, cas 4) : le bloc la
   * garde un an ; un double clic n'en demande qu'un, et une clé fixe par
   * personne tairait une seconde suspension. Ni adresse ni nom dans la clé.
   */
  private async tell(
    { id: staffUserId, intentKey }: SetStaffStatusCommand,
    target: StaffUserSnapshot,
    status: "active" | "suspended",
  ): Promise<void> {
    if (status === "suspended") {
      await this.mail.send({
        to: target.email,
        template: "staff.access-suspended",
        idempotencyKey: `staff.access-suspended:${staffUserId}:${intentKey}`,
        data: { firstName: target.firstName },
        subjects: [{ type: "staff_member", id: staffUserId }],
      });
      return;
    }
    await this.mail.send({
      to: target.email,
      template: "staff.access-restored",
      idempotencyKey: `staff.access-restored:${staffUserId}:${intentKey}`,
      data: { firstName: target.firstName, backOfficeUrl: this.config.adminBaseUrl() ?? "" },
      subjects: [{ type: "staff_member", id: staffUserId }],
    });
  }
}
