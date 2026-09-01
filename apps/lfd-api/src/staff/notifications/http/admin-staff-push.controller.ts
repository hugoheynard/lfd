import {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  type PushCapability,
  type PushSubscriptionPayload,
  type PushUnsubscribePayload,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { StaffPushSender, StaffPushSubscriptions } from "../domain/ports/staff-push.js";

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
    private readonly sender: StaffPushSender,
    private readonly subscriptions: StaffPushSubscriptions,
  ) {}

  /**
   * La clé publique VAPID, ou `null`. Publique par construction : elle voyage
   * dans chaque abonnement et sert au service de push à vérifier notre
   * signature — la garder secrète n'aurait aucun sens.
   */
  @Get("key")
  key(): PushCapability {
    return { publicKey: this.sender.publicKey() };
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @Body(new ZodBody(pushSubscriptionSchema)) body: PushSubscriptionPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.subscriptions.save(
      { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth },
      staffSub,
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Body(new ZodBody(pushUnsubscribeSchema)) body: PushUnsubscribePayload,
  ): Promise<void> {
    await this.subscriptions.forget(body.endpoint);
  }
}
