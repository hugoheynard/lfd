import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import type { LeadStatus } from "@lfd/contracts";
import { Clock } from "../../../infra/time/clock.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { LeadNotFoundError } from "../../domain/errors/lead-errors.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { LeadRepository } from "../../domain/ports/lead.repository.js";
import { ChangeLeadStatusCommand } from "./change-lead-status.command.js";

/**
 * Applique une transition manuelle : charge l'agrégat (404 si absent), délègue la
 * garde au domaine (`lead.moveTo`, qui refuse recul / lead clos), persiste, puis
 * **journalise** l'événement adéquat (`lead.converted` / `lead.lost` /
 * `lead.stage_changed`). Le journal est best-effort ; la transition, elle, est la
 * vérité transactionnelle.
 */
@CommandHandler(ChangeLeadStatusCommand)
export class ChangeLeadStatusHandler implements ICommandHandler<ChangeLeadStatusCommand, void> {
  constructor(
    private readonly leads: LeadRepository,
    private readonly recorder: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(command: ChangeLeadStatusCommand): Promise<void> {
    const lead = await this.leads.load(command.leadId);
    if (lead === null) {
      throw new LeadNotFoundError(command.leadId);
    }
    lead.moveTo(command.status, this.clock.now());
    await this.leads.save(lead);
    await this.journal(command.leadId, command.status);
  }

  private journal(leadId: string, status: Exclude<LeadStatus, "new">): Promise<void> {
    if (status === "converted") {
      return this.recorder.record({
        type: ACTIVITY_TYPES.leadConverted,
        subjectType: "lead",
        subjectId: leadId,
        idempotencyKey: `${ACTIVITY_TYPES.leadConverted}:${leadId}`,
        payload: { via: "manual" },
      });
    }
    if (status === "lost") {
      return this.recorder.record({
        type: ACTIVITY_TYPES.leadLost,
        subjectType: "lead",
        subjectId: leadId,
        idempotencyKey: `${ACTIVITY_TYPES.leadLost}:${leadId}`,
        payload: {},
      });
    }
    return this.recorder.record({
      type: ACTIVITY_TYPES.leadStageChanged,
      subjectType: "lead",
      subjectId: leadId,
      idempotencyKey: `${ACTIVITY_TYPES.leadStageChanged}:${leadId}:${status}`,
      payload: { status },
    });
  }
}
