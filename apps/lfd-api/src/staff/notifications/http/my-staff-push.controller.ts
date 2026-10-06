import {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  type PushCapability,
  type PushSubscriptionPayload,
  type PushUnsubscribePayload,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSelfSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SubscribeStaffPushCommand } from "../application/commands/subscribe-staff-push.command.js";
import { UnsubscribeStaffPushCommand } from "../application/commands/unsubscribe-staff-push.command.js";
import { GetPushCapabilityQuery } from "../application/queries/get-push-capability.query.js";

/**
 * **Abonner MON appareil** (`a-la-porte.md`, B5 ; `plan-tournee-prete.md`,
 * PL5-D2) — par l'authentification staff seule : l'ancienne route
 * (`admin/notifications/push`, qui reste) exige la cloche partagée, et
 * refuserait qui ne reçoit que des notices adressées par droit.
 *
 * S'abonner ne donne rien à recevoir : la poussée est murée À L'ENVOI —
 * l'appareil ne reçoit que ce que son abonné a, à ce moment-là, le droit de
 * lire (`PushingStaffNotifier`). Mêmes commandes que l'ancienne route.
 */
@Controller("admin/me/notifications/push")
@AdminSelfSurface()
export class MyStaffPushController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** La clé publique VAPID, ou `null` — publique par construction. */
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
