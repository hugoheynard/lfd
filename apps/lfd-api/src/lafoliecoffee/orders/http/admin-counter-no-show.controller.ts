import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { DeclareOrderNoShowCommand } from "../application/commands/declare-order-no-show.command.js";
import { RequestNoShowNoticeCommand } from "../application/commands/request-no-show-notice.command.js";

/**
 * **La commande que le client n'est pas venu retirer** — deux gestes du
 * comptoir sur une commande à régler en boutique
 * (`plan-commande-particulier-reglee-en-boutique.md`, § 5 bis, § 7 Q5).
 *
 * Surface du comptoir. « Le client n'est pas venu » est sous le droit de la
 * saisie (`b2b_place_order:write`), comme la commande qu'il clôt ;
 * « Prévenir le client » demande la supervision (`b2b_supervision:write`,
 * le droit qui juge déjà au comptoir) : l'e-mail se décide, il ne part pas
 * de lui-même. Les deux rendent `204` — la fiche se relit
 * (`GET /admin/orders/:id`) ; un refus est un `409` qui porte sa phrase.
 */
@Controller("admin/counter/particular-orders")
@AdminSurface("b2b_counter")
export class AdminCounterNoShowController {
  constructor(private readonly commands: CommandBus) {}

  /** « Le client n'est pas venu » — après la fin du créneau. Une fois par intention de l'écran. */
  @Post(":id/no-show")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async declareNoShow(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<DeclareOrderNoShowCommand, void>(
      new DeclareOrderNoShowCommand(id, staffUserId, intentKey),
    );
  }

  /**
   * « Prévenir le client » — l'e-mail « commande non retirée » est DEMANDÉ,
   * une fois par commande ; la fiche dit qui l'a demandé, et quand.
   */
  @Post(":id/no-show-notice")
  @RequirePermission("b2b_supervision:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestNotice(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<RequestNoShowNoticeCommand, void>(
      new RequestNoShowNoticeCommand(id, staffUserId, intentKey),
    );
  }
}
