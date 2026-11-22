import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { Clock } from "../../../../platform/time/clock.js";
import { noticeAudienceChangedFact } from "../../domain/notice-audience/staff-notice-audience.facts.js";
import {
  StaffNoticeAudienceRepository,
  StaffNoticeTargetsReader,
} from "../../domain/notice-audience/staff-notice-audience.ports.js";
import { SetStaffNoticeAudienceCommand } from "./set-staff-notice-audience.command.js";

/**
 * Pose les destinataires d'un avis, dans une transaction : l'agrégat
 * refuse une ligne invalide, le dépôt écrit l'écart, et le fait
 * `staff.notice_audience_changed` part avec — rien si rien n'a changé.
 *
 * Les cibles lues couvrent l'avant ET l'après : un membre retiré se nomme au
 * journal comme un membre ajouté.
 */
@CommandHandler(SetStaffNoticeAudienceCommand)
export class SetStaffNoticeAudienceHandler implements ICommandHandler<
  SetStaffNoticeAudienceCommand,
  void
> {
  constructor(
    private readonly audiences: StaffNoticeAudienceRepository,
    private readonly targets: StaffNoticeTargetsReader,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetStaffNoticeAudienceCommand): Promise<void> {
    await this.uow.run(async () => {
      const audience = await this.audiences.load(command.template);
      const before = audience.snapshot();
      const targets = await this.targets.targetsOf(
        [...before.roleKeys, ...command.roleKeys],
        [...before.staffUserIds, ...command.staffUserIds],
      );
      const change = audience.settle(command.roleKeys, command.staffUserIds, targets);
      const fact = noticeAudienceChangedFact(audience, change);
      if (fact === null) {
        return;
      }
      await this.audiences.save(audience, { by: command.actorId, at: this.clock.now() });
      await this.journal.append(fact);
    });
  }
}
