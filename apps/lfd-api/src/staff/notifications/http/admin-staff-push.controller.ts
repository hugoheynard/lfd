import {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  type PushCapability,
  type PushSubscriptionPayload,
  type PushUnsubscribePayload,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SubscribeStaffPushCommand } from "../application/commands/subscribe-staff-push.command.js";
import { UnsubscribeStaffPushCommand } from "../application/commands/unsubscribe-staff-push.command.js";
import { GetPushCapabilityQuery } from "../application/queries/get-push-capability.query.js";

/**
 * L'**abonnement du navigateur** aux notifications poussées.
 *
 * Trois gestes seulement, tous idempotents : demander la clé, s'abonner, se
 * désabonner. Le ciblage n'existe pas — la cloche est commune à l'équipe, et un
 * abonnement dit « cet appareil-ci veut être prévenu », pas « moi seul ».
 *
 * Même surface que la cloche (`support`) : qui a le droit de la lire a le droit
 * de la recevoir sur son téléphone.
 */
@Controller("admin/notifications/push")
@AdminSurface("staff_notifications")
export class AdminStaffPushController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * La clé publique VAPID, ou `null`. Publique par construction : elle voyage
   * dans chaque abonnement et sert au service de push à vérifier notre
   * signature — la garder secrète n'aurait aucun sens.
   */
  @Get("key")
  key(): Promise<PushCapability> {
    return this.queries.execute<GetPushCapabilityQuery, PushCapability>(
      new GetPushCapabilityQuery(),
    );
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @Body(new ZodBody(pushSubscriptionSchema)) body: PushSubscriptionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SubscribeStaffPushCommand, void>(
      new SubscribeStaffPushCommand(
        { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth },
        staffUserId,
      ),
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Body(new ZodBody(pushUnsubscribeSchema)) body: PushUnsubscribePayload,
  ): Promise<void> {
    await this.commands.execute<UnsubscribeStaffPushCommand, void>(
      new UnsubscribeStaffPushCommand(body.endpoint),
    );
  }
}
