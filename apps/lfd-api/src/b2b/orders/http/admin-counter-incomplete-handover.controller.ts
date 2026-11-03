import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  counterIncompleteHandoverPayloadSchema,
  type CounterIncompleteHandoverPayload,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { HandOverPackedAtCounterCommand } from "../application/commands/hand-over-packed-at-counter.command.js";

/**
 * **« Remettre ce qui est au bac »** — le départ incomplet décidé au comptoir
 * (plan `documentation/comptoir/plan-depart-incomplet-au-comptoir.md`, §4.2
 * et §4.3 — Hugo, 2026-11-03). Une route du COMMERCE : la décision et le BL
 * sont à lui ; le colisage et le retrait y entrent par leurs guichets.
 *
 * Sous `handover_counter:write` — tout vendeur du comptoir (D2) ; la route
 * des managers (`b2b_orders_shortfall`) ne bouge pas.
 */
@Controller("admin/counter/orders/:orderId")
@AdminSurface("handover_counter")
export class AdminCounterIncompleteHandoverController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Corps `{ remainder: "abandoned" }`. `204` : la file du comptoir se relit.
   *
   * Refus, avec leur phrase : livraison, autre jour (`403`) ; annulée, déjà
   * retirée, non réglée, en vérification, transfert non reçu, carte, bon de
   * fidélité, pas confirmée, trop ancienne, déjà décidée, pas tirée au
   * colisage, bac fermé, compté par contenants, rien ne manque, rien au bac,
   * signal du poste au même instant (`409`) ; commande inconnue (`404`).
   */
  @Post("incomplete-handover")
  @HttpCode(HttpStatus.NO_CONTENT)
  async handOverPacked(
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(counterIncompleteHandoverPayloadSchema))
    payload: CounterIncompleteHandoverPayload,
  ): Promise<void> {
    await this.commands.execute<HandOverPackedAtCounterCommand, void>(
      new HandOverPackedAtCounterCommand(orderId, staffUserId, payload.remainder),
    );
  }
}
