import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceptions } from "../domain/resupply-receptions.js";
import { SiteResupplyNotFoundError } from "../domain/site-resupply-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { CancelSiteResupplyCommand } from "./cancel-site-resupply.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Annule un réassort.** Chargé sous le point de l'URL : celui d'un autre
 * point est introuvable. Sa réception est lue et remise à l'agrégat, qui
 * refuse d'annuler un réassort déjà réceptionné (lot R1d).
 */
@CommandHandler(CancelSiteResupplyCommand)
export class CancelSiteResupplyHandler implements ICommandHandler<CancelSiteResupplyCommand, void> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly receptions: ResupplyReceptions,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: CancelSiteResupplyCommand): Promise<void> {
    const resupply = await this.resupplies.load(command.siteId, command.resupplyId);
    if (resupply === null) {
      throw new SiteResupplyNotFoundError(command.resupplyId);
    }
    const reception = await this.receptions.receptionOf(command.siteId, resupply.id);
    resupply.cancel(await traceOf(this.staff, this.clock, command.staffUserId), reception);
    await this.resupplies.save(resupply);
  }
}
