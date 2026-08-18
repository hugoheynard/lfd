import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { Lead } from "../../domain/entities/lead.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { LeadRepository } from "../../domain/ports/lead.repository.js";
import { CaptureLeadCommand } from "./capture-lead.command.js";

/**
 * Saisit un lead cold : construit l'agrégat (`Lead.capture`, qui valide),
 * persiste, puis **journalise `lead.captured`** (démarchage tracé dans le journal
 * comme tout le reste). Rend l'id créé.
 */
@CommandHandler(CaptureLeadCommand)
export class CaptureLeadHandler implements ICommandHandler<CaptureLeadCommand, string> {
  constructor(
    private readonly leads: LeadRepository,
    private readonly recorder: ActivityRecorder,
  ) {}

  async execute(command: CaptureLeadCommand): Promise<string> {
    const lead = Lead.capture(command.payload);
    const id = await this.leads.create(lead);
    await this.recorder.record({
      type: ACTIVITY_TYPES.leadCaptured,
      subjectType: "lead",
      subjectId: id,
      idempotencyKey: `${ACTIVITY_TYPES.leadCaptured}:${id}`,
      payload: { businessName: lead.businessName, email: lead.email },
    });
    return id;
  }
}
