import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ClosePackingOrderCommand } from "../application/station/close-packing-order.command.js";
import { ReportPackingShortfallCommand } from "../application/station/report-packing-shortfall.command.js";
import { ReopenPackingOrderCommand } from "../application/station/reopen-packing-order.command.js";
import { RecoverMissingPiecesCommand } from "../application/station/recover-missing-pieces.command.js";
import { ReportPackingProblemCommand } from "../application/station/report-packing-problem.command.js";
import { DeclareAllReadyCommand } from "../application/station/declare-all-ready.command.js";
import { IntentKey } from "../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { packingDayOf } from "./packing-day-path.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit le poste. */
const NO_CONTENT = 204;

/** « Problème » : ce qui est vraiment là, par SKU — la forme seulement. */
const packingProblemSchema = z.object({
  lines: z.array(z.object({ sku: z.string().min(1), present: z.number().int().min(0) })),
});
type PackingProblemBody = z.infer<typeof packingProblemSchema>;

/** « Pièces retrouvées » : par SKU, combien — la forme seulement. */
const foundPiecesSchema = z.object({
  lines: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().min(1) })).min(1),
});
type FoundPiecesBody = z.infer<typeof foundPiecesSchema>;

/**
 * **Fermer et rouvrir une commande au colisage** (plan
 * `colisage/colisage.md`, §17.2, K3a).
 *
 * - `POST …/close` — « Déclarer prête » : le bac fermé, `packing.order_packed`
 *   publié dans la même transaction ;
 * - `POST …/reopen` — rouvrir le rangement seulement (option b de Hugo) :
 *   refusé si un bac est chargé ou la tournée partie ; la commande reste
 *   « prête » au commerce ;
 * - `POST …/shortfall` — « Il manque » (E6a) : fige ce qui est au bac et
 *   publie `packing.shortfall_reported` ; la fiche reste ouverte ;
 * - `POST …/all-ready` — « Tout est prêt » (retrait au niveau simple) : un
 *   sac ouvert, chaque ligne mise entière par la réserve, la fiche fermée et
 *   `packing.order_packed` publié ; refusé, rien d'écrit, si tout n'est pas
 *   arrivé ;
 * - `POST …/problem` — « Problème » (retrait au niveau simple) : le sac porte
 *   ce qui est vraiment là, l'absent est mis de côté, le manque est déclaré ;
 * - `POST …/found` — « Pièces retrouvées » : des pièces mises de côté
 *   reviennent au libre de la réserve.
 *
 * « Tout est prêt », « Problème » et « Pièces retrouvées » sont par intention (`Idempotency-Key`,
 * obligatoire) : un double clic ne les fait qu'une fois.
 *
 * Sous `production_packing` (`write`). Toutes rendent `204` : l'écran relit
 * `GET admin/packing/:date/board`. Il n'injecte que le `CommandBus`.
 */
@Controller("admin/packing/:date/orders/:orderId")
@AdminSurface("production_packing")
export class PackingOrdersController {
  constructor(private readonly commands: CommandBus) {}

  @Idempotent(
    "refermer une fiche déjà scellée la réannonce telle qu'elle est (réparation voulue d'un commerce en arrière, Hugo, 2026-11-12) ; rien n'est re-colisé",
  )
  @Post("close")
  @HttpCode(NO_CONTENT)
  async close(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ClosePackingOrderCommand, void>(
      new ClosePackingOrderCommand(packingDayOf(date), orderId, staffUserId),
    );
  }

  @Idempotent(
    "un second signalement remplace le premier : le bac a pu changer, et le fait neuf dit l'état exact du manque (domaine, Hugo, 2026-11-12) ; rien ne s'additionne",
  )
  @Post("shortfall")
  @HttpCode(NO_CONTENT)
  async reportShortfall(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ReportPackingShortfallCommand, void>(
      new ReportPackingShortfallCommand(packingDayOf(date), orderId, staffUserId),
    );
  }

  @Post("reopen")
  @Idempotent(
    "transition : rejouée sur une fiche déjà rouverte, la requête rend avant toute écriture",
  )
  @HttpCode(NO_CONTENT)
  async reopen(@Param("date") date: string, @Param("orderId") orderId: string): Promise<void> {
    await this.commands.execute<ReopenPackingOrderCommand, void>(
      new ReopenPackingOrderCommand(packingDayOf(date), orderId),
    );
  }

  @Post("all-ready")
  @HttpCode(NO_CONTENT)
  async declareAllReady(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<DeclareAllReadyCommand, void>(
      new DeclareAllReadyCommand(packingDayOf(date), orderId, staffUserId, intentKey),
    );
  }

  @Post("problem")
  @HttpCode(NO_CONTENT)
  async reportProblem(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @Body(new ZodBody(packingProblemSchema)) body: PackingProblemBody,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<ReportPackingProblemCommand, void>(
      new ReportPackingProblemCommand(
        packingDayOf(date),
        orderId,
        body.lines,
        staffUserId,
        intentKey,
      ),
    );
  }

  @Post("found")
  @HttpCode(NO_CONTENT)
  async recoverFound(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @Body(new ZodBody(foundPiecesSchema)) body: FoundPiecesBody,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<RecoverMissingPiecesCommand, void>(
      new RecoverMissingPiecesCommand(
        packingDayOf(date),
        orderId,
        body.lines,
        staffUserId,
        intentKey,
      ),
    );
  }
}
