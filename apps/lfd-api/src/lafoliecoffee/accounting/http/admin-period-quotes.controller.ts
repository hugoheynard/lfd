import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ResendPeriodQuoteCommand } from "../application/commands/resend-period-quote.command.js";

/**
 * Surface **staff** des devis de période (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD4) : « Renvoyer le devis »,
 * sous `b2b_accounting:write`, déduit du verbe — la ressource de la
 * facturation, celle du renvoi de « Votre facture ».
 */
@Controller("admin/period-quotes")
@AdminSurface("b2b_accounting")
export class AdminPeriodQuotesController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Renvoie le devis : la même version si ses commandes n'ont pas changé,
   * sinon une nouvelle version rangée. Rend l'identifiant de la version
   * envoyée ; 409 nommé pour un devis facturé ou remplacé, ou sans personne
   * à prévenir.
   */
  @Post(":quoteId/resend")
  @HttpCode(HttpStatus.OK)
  async resend(
    @Param("quoteId") quoteId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<{ readonly quoteId: string }> {
    const sent = await this.commands.execute<ResendPeriodQuoteCommand, string>(
      new ResendPeriodQuoteCommand(quoteId, staffUserId, intentKey),
    );
    return { quoteId: sent };
  }
}
