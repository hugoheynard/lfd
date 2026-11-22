import { Global, Module } from "@nestjs/common";

import { MarkMyNotificationReadHandler } from "./application/commands/mark-my-notification-read.handler.js";
import { MarkNotificationReadHandler } from "./application/commands/mark-notification-read.handler.js";
import { SubscribeStaffPushHandler } from "./application/commands/subscribe-staff-push.handler.js";
import { UnsubscribeStaffPushHandler } from "./application/commands/unsubscribe-staff-push.handler.js";
import { GetMyNotificationsHandler } from "./application/queries/get-my-notifications.handler.js";
import { GetPushCapabilityHandler } from "./application/queries/get-push-capability.handler.js";
import { PushingStaffNotifier } from "./application/pushing-staff-notifier.js";
import { GetStaffNotificationsHandler } from "./application/queries/get-staff-notifications.handler.js";
import {
  AudienceNotificationReader,
  StaffNoticeStore,
  StaffNotificationReader,
  StaffNotifier,
} from "./domain/ports/staff-notifier.js";
import { StaffPushSender, StaffPushSubscriptions } from "./domain/ports/staff-push.js";
import { AdminStaffNotificationsController } from "./http/admin-staff-notifications.controller.js";
import { AdminStaffPushController } from "./http/admin-staff-push.controller.js";
import { MyStaffNotificationsController } from "./http/my-staff-notifications.controller.js";
import { MyStaffPushController } from "./http/my-staff-push.controller.js";
import { PrismaAudienceNotificationReader } from "./infrastructure/prisma-audience-notifications.js";
import {
  PrismaStaffNoticeStore,
  PrismaStaffNotificationReader,
} from "./infrastructure/prisma-staff-notifications.js";
import { PrismaStaffPushSubscriptions } from "./infrastructure/prisma-staff-push-subscriptions.js";
import { WebPushSender } from "./infrastructure/web-push-sender.js";
import { SetStaffNoticeAudienceHandler } from "./application/commands/set-staff-notice-audience.handler.js";
import { ListStaffNoticeAudiencesHandler } from "./application/queries/list-staff-notice-audiences.handler.js";
import {
  StaffNoticeAudienceReader,
  StaffNoticeAudienceRepository,
  StaffNoticeTargetsReader,
} from "./domain/notice-audience/staff-notice-audience.ports.js";
import { StaffNoticeRecipients } from "./domain/ports/staff-notice-recipients.js";
import { AdminStaffNoticeAudiencesController } from "./http/admin-staff-notice-audiences.controller.js";
import { PrismaStaffNoticeAudienceReader } from "./infrastructure/prisma-staff-notice-audience.reader.js";
import { PrismaStaffNoticeAudienceRepository } from "./infrastructure/prisma-staff-notice-audience.repository.js";
import { PrismaStaffNoticeRecipients } from "./infrastructure/prisma-staff-notice-recipients.js";
import { PrismaStaffNoticeTargetsReader } from "./infrastructure/prisma-staff-notice-targets.js";

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
 *
 * Depuis le 2026-10-01 (`a-la-porte.md`, B5), deux fils : le PARTAGÉ
 * (`admin/notifications`, sous `staff_notifications`) et « mes
 * notifications » (`admin/me/notifications`, l'authentification seule), où
 * vivent les notices adressées par droit. Chacun porte son mur dans ses
 * requêtes, et la poussée les suit tous deux. `StaffPermissionHolders` vient
 * du module global de l'annuaire (`StaffAuthorsModule`).
 *
 * Les destinataires des avis par e-mail (lot P1c) vivent ici aussi : leur
 * réglage, son écran, et la lecture publiée {@link StaffNoticeRecipients} que
 * le bloc `mail` prend pour écrire une demande par membre.
 */
@Global()
@Module({
  controllers: [
    AdminStaffNotificationsController,
    AdminStaffPushController,
    MyStaffNotificationsController,
    MyStaffPushController,
    AdminStaffNoticeAudiencesController,
  ],
  providers: [
    { provide: StaffNoticeStore, useClass: PrismaStaffNoticeStore },
    { provide: StaffNotifier, useClass: PushingStaffNotifier },
    { provide: StaffNotificationReader, useClass: PrismaStaffNotificationReader },
    { provide: AudienceNotificationReader, useClass: PrismaAudienceNotificationReader },
    { provide: StaffPushSubscriptions, useClass: PrismaStaffPushSubscriptions },
    { provide: StaffPushSender, useClass: WebPushSender },
    GetStaffNotificationsHandler,
    MarkNotificationReadHandler,
    GetMyNotificationsHandler,
    MarkMyNotificationReadHandler,
    GetPushCapabilityHandler,
    SubscribeStaffPushHandler,
    UnsubscribeStaffPushHandler,
    { provide: StaffNoticeAudienceRepository, useClass: PrismaStaffNoticeAudienceRepository },
    { provide: StaffNoticeTargetsReader, useClass: PrismaStaffNoticeTargetsReader },
    { provide: StaffNoticeAudienceReader, useClass: PrismaStaffNoticeAudienceReader },
    { provide: StaffNoticeRecipients, useClass: PrismaStaffNoticeRecipients },
    SetStaffNoticeAudienceHandler,
    ListStaffNoticeAudiencesHandler,
  ],
  exports: [StaffNotifier, StaffNoticeRecipients],
})
export class StaffNotificationsModule {}
