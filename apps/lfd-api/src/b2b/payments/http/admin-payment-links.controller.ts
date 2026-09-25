import {
  createPaymentLinkPayloadSchema,
  type CreatedPaymentLink,
  type CreatePaymentLinkPayload,
  type PaymentLinkView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CancelPaymentLinkCommand } from "../application/commands/cancel-payment-link.command.js";
import { CreatePaymentLinkCommand } from "../application/commands/create-payment-link.command.js";
import { ListPaymentLinksQuery } from "../application/queries/list-payment-links.query.js";

/**
 * Surface **comptabilité** des liens de paiement libres (plan
 * `plan-blocage-prelevement-et-liens-de-paiement.md` §2b). L'action se déduit
 * du verbe (`GET` → lecture, le reste → écriture).
 *
 * Les commandes à régler (§2a) vivent sous `…/payment-links/orders`, dans le
 * contexte `orders` qui possède la commande.
 */
@Controller("admin/accounting/payment-links")
@AdminSurface("b2b_accounting")
export class AdminPaymentLinksController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(): Promise<readonly PaymentLinkView[]> {
    return this.queries.execute<ListPaymentLinksQuery, readonly PaymentLinkView[]>(
      new ListPaymentLinksQuery(),
    );
  }

  /** Ouvre une page Stripe hébergée ; rend l'URL à copier. */
  @Post()
  create(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(createPaymentLinkPayloadSchema)) payload: CreatePaymentLinkPayload,
  ): Promise<CreatedPaymentLink> {
    return this.commands.execute<CreatePaymentLinkCommand, CreatedPaymentLink>(
      new CreatePaymentLinkCommand(
        payload.companyId,
        payload.amountCents,
        payload.label,
        staffUserId,
      ),
    );
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@StaffUserId() staffUserId: string, @Param("id") id: string): Promise<void> {
    await this.commands.execute<CancelPaymentLinkCommand, void>(
      new CancelPaymentLinkCommand(id, staffUserId),
    );
  }
}
