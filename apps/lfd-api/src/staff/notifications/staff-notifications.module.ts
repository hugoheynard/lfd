import { Global, Module } from "@nestjs/common";

import { MarkNotificationReadHandler } from "./application/commands/mark-notification-read.handler.js";
import { PushingStaffNotifier } from "./application/pushing-staff-notifier.js";
import { GetStaffNotificationsHandler } from "./application/queries/get-staff-notifications.handler.js";
import {
  StaffNoticeStore,
  StaffNotificationReader,
  StaffNotifier,
} from "./domain/ports/staff-notifier.js";
import { StaffPushSender, StaffPushSubscriptions } from "./domain/ports/staff-push.js";
import { AdminStaffNotificationsController } from "./http/admin-staff-notifications.controller.js";
import { AdminStaffPushController } from "./http/admin-staff-push.controller.js";
import {
  PrismaStaffNoticeStore,
  PrismaStaffNotificationReader,
} from "./infrastructure/prisma-staff-notifications.js";
import { PrismaStaffPushSubscriptions } from "./infrastructure/prisma-staff-push-subscriptions.js";
import { WebPushSender } from "./infrastructure/web-push-sender.js";

/**
 * La **cloche du back-office** — socle générique, pas une cloche à alertes.
 *
 * `@Global` parce que n'importe quel contexte doit pouvoir prévenir l'équipe sans
 * réimporter une chaîne de modules — même raison que le mailer. Il n'exporte que
 * le port d'**émission** : la lecture appartient à cet écran-là, et l'abonnement
 * des téléphones à son contrôleur.
 *
 * `StaffNotifier` est câblé sur le **décorateur**, pas sur la persistance : ce
 * qui écrit et ce qui fait vibrer sont deux responsabilités, et les émetteurs
 * n'ont à connaître ni l'une ni l'autre.
 */
@Global()
@Module({
  controllers: [AdminStaffNotificationsController, AdminStaffPushController],
  providers: [
    { provide: StaffNoticeStore, useClass: PrismaStaffNoticeStore },
    { provide: StaffNotifier, useClass: PushingStaffNotifier },
    { provide: StaffNotificationReader, useClass: PrismaStaffNotificationReader },
    { provide: StaffPushSubscriptions, useClass: PrismaStaffPushSubscriptions },
    { provide: StaffPushSender, useClass: WebPushSender },
    GetStaffNotificationsHandler,
    MarkNotificationReadHandler,
  ],
  exports: [StaffNotifier],
})
export class StaffNotificationsModule {}
