import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceptions } from "../domain/resupply-receptions.js";
import { SiteResupplyNotFoundError } from "../domain/site-resupply-errors.js";
import { SiteResupplyPlanKeyReader } from "../domain/site-resupply-plan-key.reader.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { CancelSiteResupplyCommand } from "./cancel-site-resupply.command.js";
import { ResupplyPlanGate } from "./resupply-plan-gate.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Annule un réassort.** Chargé sous le point de l'URL : celui d'un autre
 * point est introuvable. Sa réception est lue et remise à l'agrégat, qui
 * refuse d'annuler un réassort déjà réceptionné.
 *
 * Sous le verrou de la journée du fournil (`ResupplyPlanGate`, 2026-10-21) :
 * un réassort « pour demain » figé dans un plan arrêté ne s'annule plus, et
 * l'arrêt ne peut pas se glisser entre la lecture et l'écriture. Un « au
 * plus tôt » LANCÉ au fournil ne s'annule plus non plus (2026-10-22) : la
 * question est posée au fournil sous le même verrou, jamais à la colonne
 * d'affichage du commerce.
 *
 * **Verrou, PUIS chargement** (2026-11-02) : la clé de la journée (visée,
 * journée — immuables) est lue d'abord, le verrou pris sur elle, et
 * l'agrégat chargé ensuite, sous lui. Il était chargé avant le verrou ; la
 * version le protégeait à l'écriture, mais une décision ne se prend que
 * sur un état lu sous le verrou qui la garde.
 */
@CommandHandler(CancelSiteResupplyCommand)
export class CancelSiteResupplyHandler implements ICommandHandler<CancelSiteResupplyCommand, void> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly keys: SiteResupplyPlanKeyReader,
    private readonly receptions: ResupplyReceptions,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly gate: ResupplyPlanGate,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelSiteResupplyCommand): Promise<void> {
    const { siteId, resupplyId } = command;
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const key = await this.keys.keyOf(siteId, resupplyId);
      if (key === null) {
        throw new SiteResupplyNotFoundError(resupplyId);
      }
      const stopped = await this.gate.hold(key.target, key.serviceDay);
      const launched = await this.gate.launched(key.target, key.serviceDay, resupplyId);
      const resupply = await this.resupplies.load(siteId, resupplyId);
      if (resupply === null) {
        throw new SiteResupplyNotFoundError(resupplyId);
      }
      const reception = await this.receptions.receptionOf(siteId, resupply.id);
      resupply.cancel(trace, reception, stopped, launched);
      await this.resupplies.save(resupply);
    });
  }
}
