import {
  type CreatedPayLinkTest,
  type CreatePayLinkTestPayload,
  createPayLinkTestPayloadSchema,
  type PayLinkTestRecipient,
  type PayLinkTestView,
} from "@lfd/contracts";
import { Body, Controller, Get, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequirePermission,
} from "../../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { SendPayLinkTestCommand } from "../application/commands/send-pay-link-test.command.js";
import { ListPayLinkTestRecipientsQuery } from "../application/queries/list-pay-link-test-recipients.query.js";
import { ListPayLinkTestsQuery } from "../application/queries/list-pay-link-tests.query.js";

/**
 * **Le lien de paiement d'essai** (doc
 * `documentation/payment/les-liens-de-paiement.md`, « Le lien d'essai »),
 * sous sa ressource à lui, `pay_link_test` : chaque essai coûte une
 * commission.
 */
@Controller("admin/payment/link-tests")
@AdminSurface("pay_link_test")
export class AdminPayLinkTestsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  @RequirePermission("pay_link_test:read")
  list(): Promise<readonly PayLinkTestView[]> {
    return this.queries.execute<ListPayLinkTestsQuery, readonly PayLinkTestView[]>(
      new ListPayLinkTestsQuery(),
    );
  }

  /** Les membres actifs joignables à qui l'on peut envoyer un essai — sans leur adresse. */
  @Get("recipients")
  @RequirePermission("pay_link_test:read")
  recipients(): Promise<readonly PayLinkTestRecipient[]> {
    return this.queries.execute<ListPayLinkTestRecipientsQuery, readonly PayLinkTestRecipient[]>(
      new ListPayLinkTestRecipientsQuery(),
    );
  }

  /**
   * Envoie un essai au membre choisi ; rend l'adresse à copier. Refus : plafond
   * du jour atteint, membre suspendu ou sans adresse (409), membre inconnu
   * (404). Une fois par intention (`Idempotency-Key`) : la même clé rend le
   * même essai.
   */
  @Post()
  @RequirePermission("pay_link_test:write")
  send(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(createPayLinkTestPayloadSchema)) payload: CreatePayLinkTestPayload,
    @IntentKey() intentKey: string,
  ): Promise<CreatedPayLinkTest> {
    return this.commands.execute<SendPayLinkTestCommand, CreatedPayLinkTest>(
      new SendPayLinkTestCommand(staffUserId, payload.staffUserId, intentKey),
    );
  }
}
