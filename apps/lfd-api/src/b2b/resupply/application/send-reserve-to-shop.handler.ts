import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { ReserveShopRelease } from "../../../packing/channels/commerce/index.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplySiteUnknownError } from "../domain/resupply-receipt-errors.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { SiteResupplyAlreadyWrittenError } from "../domain/site-resupply-errors.js";
import { SiteResupply, type SiteResupplyTrace } from "../domain/site-resupply.js";
import type { SiteResupplyLine } from "../domain/site-resupply-line.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { SendReserveToShopCommand } from "./send-reserve-to-shop.command.js";
import { catalogueLine } from "./site-resupply-draft.js";

/**
 * **« Envoyer en boutique »** — une sortie de la réserve du colisage (plan
 * A1, lot A1.4, `documentation/commandes/annulation/plan-a1-4-envoyer-en-boutique.md`
 * § 2). Le pain est déjà fabriqué : le point le reçoit comme un réassort
 * d'origine `reserve`, envoyé « au plus tôt », jamais lancé — ni plan, ni
 * four, ni réservation, ni transfert.
 *
 * Dans UNE unité de travail, dans cet ordre (§ 2) : le réassort est écrit,
 * puis le colisage fait sortir les pièces de la réserve, article par article
 * triés par SKU, sous verrou (`ReserveShopRelease`). Un libre insuffisant
 * refuse, et le refus défait tout, réassort compris.
 *
 * Les libellés sont lus au catalogue publié, comme pour un réassort du
 * fournil, et lus AVANT l'unité de travail, comme l'auteur et le nom du point.
 * La clé de l'écran est l'identifiant du réassort : déjà écrit, rien ne se
 * refait — y compris quand deux envois de la même clé se croisent : le
 * second bute sur la clé primaire, sa transaction est défaite, et il rend ce
 * que rend le rejeu.
 */
@CommandHandler(SendReserveToShopCommand)
export class SendReserveToShopHandler implements ICommandHandler<SendReserveToShopCommand, string> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly catalogue: ResupplyCatalogue,
    private readonly sites: ResupplySites,
    private readonly labels: ResupplySiteLabels,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly release: ReserveShopRelease,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SendReserveToShopCommand): Promise<string> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const lines: SiteResupplyLine[] = [];
    for (const requested of command.lines) {
      lines.push(await catalogueLine(this.catalogue, requested));
    }
    const siteLabel = (await this.labels.labelsOf([command.siteId])).get(command.siteId) ?? null;
    try {
      await this.uow.run(() => this.sendOnce(command, lines, trace, siteLabel));
    } catch (error) {
      if (!(error instanceof SiteResupplyAlreadyWrittenError)) {
        throw error;
      }
    }
    return command.key;
  }

  /** Le réassort, puis la sortie de réserve — rien si la clé est déjà écrite. */
  private async sendOnce(
    command: SendReserveToShopCommand,
    lines: readonly SiteResupplyLine[],
    trace: SiteResupplyTrace,
    siteLabel: string | null,
  ): Promise<void> {
    if ((await this.resupplies.load(command.siteId, command.key)) !== null) {
      return;
    }
    const resupply = SiteResupply.sentFromReserve({
      id: command.key,
      siteId: command.siteId,
      reserveDay: command.serviceDay,
      lines,
      trace,
    });
    await this.resupplies.save(resupply);
    await this.release.send({
      serviceDay: command.serviceDay,
      siteId: command.siteId,
      siteLabel,
      resupplyId: resupply.id,
      lines: resupply.lines.map((line) => ({
        sku: line.sku,
        productName: line.label,
        quantity: line.quantity,
      })),
    });
  }
}
