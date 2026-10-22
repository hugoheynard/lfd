import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceptions } from "../domain/resupply-receptions.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import { SiteResupplyNotFoundError } from "../domain/site-resupply-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { MarkResupplyMountedCommand } from "./mark-resupply-mounted.command.js";
import { ResupplyArrivedBell } from "./resupply-arrived-bell.js";
import { ResupplyPlanGate } from "./resupply-plan-gate.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **« Monté »** (lot R3e de `reassort-boutiques/plan-reapprovisionnement.md`)
 * — le geste du fournil pour un point servi sur place (le Labo) : le réassort
 * passe d'attendu à arrivé, et la cloche sonne au comptoir.
 *
 * Chargé sous le point de l'URL (le mur par point). Idempotent : déjà
 * arrivé, ou déjà réceptionné, rien ne change et rien ne sonne. Le serveur
 * ne refuse pas « Monté » à un point servi par transfert — l'écran ne le
 * propose qu'aux autres.
 *
 * Depuis R4c (Q4), un « au plus tôt » n'est monté qu'une fois LANCÉ : la
 * question est posée au fournil sous le verrou de la journée
 * (`ResupplyPlanGate.launched`, comme l'annulation), jamais à la colonne
 * d'affichage.
 *
 * @throws {SiteResupplyNotFoundError} @throws {ResupplyNotArrivableError}
 * @throws {ResupplyNotLaunchedNotMountableError}
 */
@CommandHandler(MarkResupplyMountedCommand)
export class MarkResupplyMountedHandler implements ICommandHandler<
  MarkResupplyMountedCommand,
  void
> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly receptions: ResupplyReceptions,
    private readonly labels: ResupplySiteLabels,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly bell: ResupplyArrivedBell,
    private readonly gate: ResupplyPlanGate,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: MarkResupplyMountedCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const resupply = await this.resupplies.load(command.siteId, command.resupplyId);
      if (resupply === null) {
        throw new SiteResupplyNotFoundError(command.resupplyId);
      }
      const reception = await this.receptions.receptionOf(command.siteId, resupply.id);
      const launched = await this.gate.launched(resupply.target, resupply.serviceDay, resupply.id);
      if (!resupply.markMounted(trace, reception, launched)) {
        return;
      }
      await this.resupplies.save(resupply);
      const labels = await this.labels.labelsOf([resupply.siteId]);
      this.bell.ring(resupply, labels.get(resupply.siteId) ?? null, trace.at);
    });
  }
}
