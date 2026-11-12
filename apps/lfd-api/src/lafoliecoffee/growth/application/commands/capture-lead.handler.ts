import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { Lead } from "../../domain/entities/lead.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { LeadRepository } from "../../domain/ports/lead.repository.js";
import { CaptureLeadCommand } from "./capture-lead.command.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "growth.capture-lead";

/**
 * Saisit un lead cold : construit l'agrégat (`Lead.capture`, qui valide),
 * persiste, puis **journalise `lead.captured`** (démarchage tracé dans le journal
 * comme tout le reste). Rend l'id créé.
 *
 * Sans l'e-mail depuis le 2026-09-19 (lot B du plan des phrases) : une
 * coordonnée n'a rien à faire au journal, et le lead la garde sur sa ligne.
 * L'enseigne y est deux fois — `businessName`, et le nom du sujet.
 */
@CommandHandler(CaptureLeadCommand)
export class CaptureLeadHandler implements ICommandHandler<CaptureLeadCommand, string> {
  constructor(
    private readonly leads: LeadRepository,
    private readonly recorder: ActivityRecorder,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est scellée avec
   * l'écriture ; un double clic rend le prospect déjà saisi sans en saisir un second.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour un autre geste.
   */
  execute(command: CaptureLeadCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject("lead", command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const lead = Lead.capture(command.payload);
          const id = await this.leads.create(lead);
          await this.recorder.record({
            type: ACTIVITY_TYPES.leadCaptured,
            subjectType: "lead",
            subjectId: id,
            idempotencyKey: `${ACTIVITY_TYPES.leadCaptured}:${id}`,
            payload: { subjectLabel: lead.businessName, businessName: lead.businessName },
          });
          await seal(id);
          return id;
        }),
    );
  }
}
