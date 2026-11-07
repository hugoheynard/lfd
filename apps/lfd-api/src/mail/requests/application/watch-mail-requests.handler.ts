import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { staffPermission } from "@lfd/contracts";

import { Clock } from "../../../platform/time/clock.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../staff/notifications/domain/ports/staff-notifier.js";
import { MailBacklogReader } from "../domain/ports/mail-backlog.reader.js";
import {
  type MailBacklogAlarm,
  mailBacklogAlarmKey,
  mailBacklogAlarms,
  mailBacklogCriteria,
  oldestStalledMinutes,
} from "../domain/services/mail-backlog.js";
import { type MailWatchReport, WatchMailRequestsCommand } from "./watch-mail-requests.command.js";

/**
 * L'écran où l'alarme mène : la carte de santé, dont le nœud courrier montre
 * les mêmes relevés. Le suivi des demandes n'a pas encore d'écran (vérifié le
 * 2026-11-07 dans `app.routes.ts` du back-office).
 */
const MAIL_ALARM_LINK = "/sante";

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
    private readonly bell: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<MailWatchReport> {
    const now = this.clock.now();
    const backlog = await this.backlog.read(mailBacklogCriteria(now));
    const alarms = mailBacklogAlarms(backlog, now);
    if (alarms.length > 0) {
      await this.bell.notify(alarms.map((alarm) => noticeOf(alarm, now)));
    }
    return {
      stalled: backlog.stalled,
      oldestStalledMinutes: oldestStalledMinutes(backlog, now),
      definitiveFailures: backlog.definitiveFailures,
      alarms: alarms.map((alarm) => alarm.kind),
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
