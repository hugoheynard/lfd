import type { PlannedColumnOpened } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { customerIntentActor } from "../../../../platform/intent/customer-intent-actor.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentString,
} from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { parisDay } from "../../../basket/application/services/paris-day.js";
import { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import { PlannedColumn } from "../../domain/entities/planned-column.js";
import { PlannedColumnRepository } from "../../domain/ports/planned-column.repository.js";
import { PlannerWall } from "../services/planner-wall.js";
import { OpenPlannedColumnCommand } from "./open-planned-column.command.js";

const OPENED_COLUMN_REPLAY: IntentCodec<PlannedColumnOpened> = {
  write: (opened) => ({ id: opened.id, version: String(opened.version) }),
  read: (record, gesture) => ({
    id: readIntentString(record, "id", gesture),
    version: Number(readIntentString(record, "version", gesture)),
  }),
};

/** Le nom stable du geste, dans le registre des intentions. */
const OPEN_COLUMN_GESTURE = "planner.columns.open";

/**
 * **Ouvre une colonne** pour un jour et un créneau. Un jour porte au plus une
 * colonne vivante par créneau : si elle existe déjà, elle est rendue telle
 * quelle. **Une fois par intention** : la clé de l'écran est réclamée avant
 * l'écriture et scellée dans sa transaction ; un double envoi rend la colonne
 * déjà ouverte, même si une autre a pris son créneau entre-temps.
 *
 * @sans-journal une colonne est un brouillon : elle ne réserve rien, le fournil
 * ne la voit pas, et rien ne se fabrique ni ne se facture tant qu'elle n'est
 * pas convertie. C'est la conversion (lot L2) qui laissera une trace.
 */
@CommandHandler(OpenPlannedColumnCommand)
export class OpenPlannedColumnHandler implements ICommandHandler<
  OpenPlannedColumnCommand,
  PlannedColumnOpened
> {
  constructor(
    private readonly wall: PlannerWall,
    private readonly columns: PlannedColumnRepository,
    private readonly intents: OncePerIntent,
    private readonly uow: UnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {PlannerProOnlyError} espace personnel.
   * @throws {PlannerMembershipLostError} la personne n'est plus membre de la société.
   * @throws {PlannedColumnInPastError} le jour est passé.
   * @throws {PlannedColumnBeyondHorizonError} le jour dépasse l'horizon.
   */
  async execute(command: OpenPlannedColumnCommand): Promise<PlannedColumnOpened> {
    const companyId = await this.wall.companyOf(command.actorUserId, command.companyId);
    return this.intents.runSealed(
      {
        actorId: customerIntentActor(command.actorUserId),
        key: command.intentKey,
        gesture: OPEN_COLUMN_GESTURE,
        subject: intentSubject(companyId, command.payload),
      },
      OPENED_COLUMN_REPLAY,
      (seal) => this.open(command, companyId, seal),
    );
  }

  private open(
    command: OpenPlannedColumnCommand,
    companyId: string,
    seal: (opened: PlannedColumnOpened) => Promise<void>,
  ): Promise<PlannedColumnOpened> {
    const { payload } = command;
    const serviceDay = IsoDate.fromString(payload.day);
    const now = this.clock.now();
    return this.uow.run(async () => {
      const existing = await this.columns.loadSlot({
        companyId,
        serviceDay,
        windowStart: payload.routing.window.start,
        windowEnd: payload.routing.window.end,
      });
      if (existing !== null) {
        const found = { id: existing.id, version: existing.version };
        await seal(found);
        return found;
      }
      const column = PlannedColumn.open(
        {
          id: this.ids.next(),
          buyerUserId: command.actorUserId,
          companyId,
          serviceDay,
          routing: payload.routing,
        },
        parisDay(now),
      );
      const opened = { id: column.id, version: await this.columns.save(column, now) };
      await seal(opened);
      return opened;
    });
  }
}
