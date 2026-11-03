import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackedResuppliesReader } from "../../../packing/channels/commerce/index.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import type { SiteResupply } from "../domain/site-resupply.js";
import { ResupplyAlreadyReceivedError } from "../domain/resupply-receipt-errors.js";
import { ResupplyReceptions } from "../domain/resupply-receptions.js";
import {
  SiteResupplyChangedMeanwhileError,
  SiteResupplyNotFoundError,
} from "../domain/site-resupply-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { ReceiveSiteResupplyCommand } from "./receive-site-resupply.command.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { ResupplyReceiving } from "./resupply-receiving.js";

/**
 * **« Réceptionner »** : le comptoir atteste, d'un geste, que le réassort est
 * arrivé. Le reçu naît attendu de la quantité DEMANDÉE, puis l'attendu
 * devient le reçu ; le stock du jour monte à cet instant, jamais à l'envoi.
 * Un écart se corrige ensuite, ligne par ligne.
 *
 * L'attendu est l'emballé au colisage s'il est connu (fiche close), sinon le
 * demandé — lu AVANT l'unité de travail, comme l'auteur : une lecture d'un
 * autre bloc ne se fait pas sous verrou. Le compte du comptoir fait foi : un
 * emballé connu APRÈS la réception ne change rien.
 *
 * Seul un réassort envoyé et non annulé se réceptionne. **Un second
 * « Réceptionner » ne fait pas d'erreur** (E2, 2026-11-03 — la politique de
 * l'envoi du comptoir) : le réassort déjà réceptionné, le geste rend succès
 * sans rien écrire, quel que soit le poste qui l'a fait — l'intention, « il
 * est là », est la même. Deux clics qui se croisent : le second bute sur la
 * version du réassort, et la réception est relue HORS de la transaction
 * défaite ; présente, c'était le même geste. Une annulation gagnante, elle,
 * reste un refus (409). Chaque article reçu (> 0) lève l'alerte de stock vivante du point, dans la
 * même transaction ({@link ResupplyReceiving}).
 *
 * ## La réception passe par l'agrégat, sous sa version (2026-11-02)
 *
 * Le réassort est chargé, `assertReceivable` le laisse passer, et il est
 * SAUVÉ sous sa version AVANT le reçu : sa version avance. L'annulation lit
 * la réception puis sauve sous la version qu'elle a lue ; sans cette
 * écriture, une annulation et une réception concurrentes passaient toutes
 * les deux, et le réassort finissait annulé ET réceptionné. Désormais la
 * seconde des deux échoue à l'écriture (`SiteResupplyChangedMeanwhileError`,
 * 409) — de même pour l'arrivée par transfert (la réception sous version, G1 de l'audit).
 */
@CommandHandler(ReceiveSiteResupplyCommand)
export class ReceiveSiteResupplyHandler implements ICommandHandler<
  ReceiveSiteResupplyCommand,
  void
> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly receiving: ResupplyReceiving,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly packed: PackedResuppliesReader,
    private readonly receptions: ResupplyReceptions,
  ) {}

  async execute(command: ReceiveSiteResupplyCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    const packed =
      (await this.packed.packedOf([command.resupplyId])).get(command.resupplyId) ?? null;
    try {
      await this.uow.run(async () => {
        const resupply = await this.receivable(command.siteId, command.resupplyId);
        if (await this.alreadyReceived(command)) {
          return;
        }
        await this.resupplies.save(resupply);
        await this.receiving.receiveAll(resupply, packed, trace);
      });
    } catch (error) {
      const raced =
        error instanceof SiteResupplyChangedMeanwhileError ||
        error instanceof ResupplyAlreadyReceivedError;
      if (!raced || !(await this.alreadyReceived(command))) {
        throw error;
      }
    }
  }

  private async alreadyReceived(command: ReceiveSiteResupplyCommand): Promise<boolean> {
    return (await this.receptions.receptionOf(command.siteId, command.resupplyId)) !== null;
  }

  private async receivable(siteId: string, resupplyId: string): Promise<SiteResupply> {
    const resupply = await this.resupplies.load(siteId, resupplyId);
    if (resupply === null) {
      throw new SiteResupplyNotFoundError(resupplyId);
    }
    resupply.assertReceivable();
    return resupply;
  }
}
