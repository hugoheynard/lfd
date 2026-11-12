import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  counterIncompleteHandoverPayloadSchema,
  type CounterIncompleteHandoverPayload,
  type CounterIncompleteHandoverView,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { HandOverPackedAtCounterCommand } from "../application/commands/hand-over-packed-at-counter.command.js";
import { GetCounterIncompleteHandoverQuery } from "../application/queries/get-counter-incomplete-handover.query.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * **« Remettre ce qui est au bac »** — le départ incomplet décidé au comptoir
 * (plan `documentation/commandes/reliquat/reliquat.md`, §2.2.2
 * et §2.2.3 — Hugo, 2026-11-03). Une route du COMMERCE : la décision et le BL
 * sont à lui ; le colisage et le retrait y entrent par leurs guichets.
 *
 * Sous `handover_counter:write` — tout vendeur du comptoir (D2) ; la route
 * des managers (`b2b_orders_shortfall`) ne bouge pas.
 */
@Controller("admin/counter/orders/:orderId")
@AdminSurface("handover_counter")
export class AdminCounterIncompleteHandoverController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * L'aperçu AVANT le geste (lot C1b, 2026-11-03), sous
   * `handover_counter:read` : le premier refus que `POST` rencontrerait, en
   * code (l'écran choisit sa phrase), et le bac — ce qui part, ce qui ne
   * part pas. `200` même refusé : le refus est la réponse. `404` : commande
   * inconnue.
   */
  @Get("incomplete-handover")
  async preview(@Param("orderId") orderId: string): Promise<CounterIncompleteHandoverView> {
    return this.queries.execute<GetCounterIncompleteHandoverQuery, CounterIncompleteHandoverView>(
      new GetCounterIncompleteHandoverQuery(orderId),
    );
  }

  /**
   * Corps `{ remainder: "abandoned", token? }`. `204` : la file du comptoir
   * se relit. `token`, le jeton du QR lu au scan : la remise est `scan` ;
   * sans, `manual` (Hugo, 2026-11-03).
   *
   * Refus, avec leur phrase : livraison, autre jour (`403`) ; annulée, déjà
   * retirée, non réglée, en vérification, transfert non reçu, carte, bon de
   * fidélité, pas confirmée, trop ancienne, déjà décidée, pas tirée au
   * colisage, bac fermé, compté par contenants, rien ne manque, rien au bac,
   * signal du poste au même instant, QR d'une autre commande (`409`) ;
   * commande ou jeton inconnus (`404`).
   */
  @Post("incomplete-handover")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "transition : rejouée, la décision relue sous verrou est déjà prise et la commande déjà retirée — l'agrégat et le comptoir refusent (409) avant toute écriture",
  )
  async handOverPacked(
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(counterIncompleteHandoverPayloadSchema))
    payload: CounterIncompleteHandoverPayload,
  ): Promise<void> {
    await this.commands.execute<HandOverPackedAtCounterCommand, void>(
      new HandOverPackedAtCounterCommand(
        orderId,
        staffUserId,
        payload.remainder,
        payload.token ?? null,
      ),
    );
  }
}
