import { Global, Module } from "@nestjs/common";

import { MarkNotificationReadHandler } from "./application/commands/mark-notification-read.handler.js";
import { GetStaffNotificationsHandler } from "./application/queries/get-staff-notifications.handler.js";
import { StaffNotificationReader, StaffNotifier } from "./domain/ports/staff-notifier.js";
import { AdminStaffNotificationsController } from "./http/admin-staff-notifications.controller.js";
import {
  PrismaStaffNotificationReader,
  PrismaStaffNotifier,
} from "./infrastructure/prisma-staff-notifications.js";

/**
 * La **cloche du back-office** — socle générique, pas une cloche à alertes.
 *
 * `@Global` parce que n'importe quel contexte doit pouvoir prévenir l'équipe sans
 * réimporter une chaîne de modules — même raison que le mailer. Il n'exporte que
 * le port d'**émission** : la lecture appartient à cet écran-là.
 */
@Global()
@Module({
  controllers: [AdminStaffNotificationsController],
  providers: [
    { provide: StaffNotifier, useClass: PrismaStaffNotifier },
    { provide: StaffNotificationReader, useClass: PrismaStaffNotificationReader },
    GetStaffNotificationsHandler,
    MarkNotificationReadHandler,
  ],
  exports: [StaffNotifier],
})
export class StaffNotificationsModule {}
