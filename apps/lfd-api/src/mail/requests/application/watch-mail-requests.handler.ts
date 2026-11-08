import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { staffPermission } from "@lfd/contracts";

import { Clock } from "../../../platform/time/clock.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../staff/notifications/domain/ports/staff-notifier.js";
import { MailProbeTemplates } from "../../sends/domain/ports/mail-probe-templates.js";
import { MailBacklogReader } from "../domain/ports/mail-backlog.reader.js";
import { MailDeliveryCountsReader } from "../domain/ports/mail-delivery-counts.reader.js";
import {
  type MailBacklogAlarm,
  mailBacklogAlarmKey,
  mailBacklogAlarms,
  mailBacklogCriteria,
  oldestStalledMinutes,
} from "../domain/services/mail-backlog.js";
import {
  type MailRejection,
  mailRejectionAlarmKey,
  mailRejectionCriteria,
} from "../domain/services/mail-rejections.js";
import { type MailWatchReport, WatchMailRequestsCommand } from "./watch-mail-requests.command.js";

/**
 * L'écran où mènent les alarmes de la file : la carte de santé, dont le nœud
 * courrier montre les mêmes relevés. (Écrit le 2026-11-07, quand le suivi
 * n'avait pas d'écran ; il en a un depuis T3, où mènent les rebonds.)
 */
const MAIL_ALARM_LINK = "/sante";

/**
 * L'écran du suivi des e-mails, où un rebond se lit (T3 ; route
 * `emails/envois` vérifiée le 2026-11-08 dans `app.routes.ts` du back-office).
 */
const MAIL_SENDS_LINK = "/emails/envois";

/** La nature des notices de la veille. */
const MAIL_ALARM_KIND = "alert.mail";

/**
 * **La veille du courrier différé** (plan `plan-service-e-mails.md`, § 25,
 * point 2).
 *
 * Lit l'âge de la plus vieille demande encore en attente et les échecs
 * définitifs du jour ; au-delà des seuils, sonne la cloche du back-office
 * (et les téléphones abonnés) par `StaffNotifier`. **Jamais par e-mail, jamais
 * par la boîte d'envoi** : c'est précisément ce qui serait en panne. La cloche
 * est synchrone et écrit dans sa propre table.
 *
 * Depuis T1b (`le-suivi-des-e-mails.md`), elle sonne aussi pour un rebond ou
 * une plainte arrivés depuis hier : une cloche par modèle, la sonde de
 * déploiement exclue (règle 10). Ceux-là sont partis, et personne ne les a
 * reçus — rien d'autre ne le dirait.
 *
 * Adressée au droit qui lit la carte de santé (`ops_health:read`) : c'est
 * l'écran où l'alarme se vérifie.
 *
 * @sans-journal geste machine, en lecture seule sur le courrier ; la cloche
 * est sa trace.
 */
@CommandHandler(WatchMailRequestsCommand)
export class WatchMailRequestsHandler implements ICommandHandler<
  WatchMailRequestsCommand,
  MailWatchReport
> {
  constructor(
    private readonly backlog: MailBacklogReader,
    private readonly deliveries: MailDeliveryCountsReader,
    private readonly probes: MailProbeTemplates,
    private readonly bell: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<MailWatchReport> {
    const now = this.clock.now();
    const backlog = await this.backlog.read(mailBacklogCriteria(now));
    const alarms = mailBacklogAlarms(backlog, now);
    const rejections = await this.deliveries.rejections(
      mailRejectionCriteria(now, this.probes.keys()),
    );
    const notices = [
      ...alarms.map((alarm) => noticeOf(alarm, now)),
      ...rejections.map((rejection) => rejectionNoticeOf(rejection, now)),
    ];
    if (notices.length > 0) {
      await this.bell.notify(notices);
    }
    return {
      stalled: backlog.stalled,
      oldestStalledMinutes: oldestStalledMinutes(backlog, now),
      definitiveFailures: backlog.definitiveFailures,
      alarms: alarms.map((alarm) => alarm.kind),
      rejectedTemplates: rejections.map((rejection) => rejection.template),
    };
  }
}

function noticeOf(alarm: MailBacklogAlarm, now: Date): StaffNotice {
  return {
    kind: MAIL_ALARM_KIND,
    ...wordsOf(alarm),
    link: MAIL_ALARM_LINK,
    idempotencyKey: mailBacklogAlarmKey(alarm, now),
    occurredAt: now,
    audience: staffPermission("ops_health", "read"),
  };
}

function rejectionNoticeOf(rejection: MailRejection, now: Date): StaffNotice {
  const rejected =
    rejection.count === 1
      ? "1 e-mail a rebondi ou été signalé"
      : `${rejection.count} e-mails ont rebondi ou été signalés`;
  return {
    kind: MAIL_ALARM_KIND,
    subject: "Courrier non reçu",
    body: `${rejected} depuis hier sur « ${rejection.template} » — personne ne les a reçus : voir le suivi des e-mails, filtre « rebondi ».`,
    link: MAIL_SENDS_LINK,
    idempotencyKey: mailRejectionAlarmKey(rejection),
    occurredAt: now,
    // Adressée au droit de l'écran où elle mène (règle 11), comme les autres
    // le sont à la carte de santé : une cloche qui ouvre un 403 ne sert à rien.
    audience: staffPermission("mail_sends", "read"),
  };
}

function wordsOf(alarm: MailBacklogAlarm): { readonly subject: string; readonly body: string } {
  if (alarm.kind === "stalled") {
    const waiting = alarm.count === 1 ? "1 e-mail attend" : `${alarm.count} e-mails attendent`;
    return {
      subject: "Courrier en attente",
      body: `${waiting} depuis ${alarm.minutes} min — la boîte d'envoi ne part plus : voir la carte de santé, nœud courrier.`,
    };
  }
  const failed = alarm.count === 1 ? "1 e-mail a échoué" : `${alarm.count} e-mails ont échoué`;
  return {
    subject: "Courrier en échec",
    body: `${failed} définitivement depuis hier — ils ne repartiront pas seuls : voir le suivi du courrier.`,
  };
}
