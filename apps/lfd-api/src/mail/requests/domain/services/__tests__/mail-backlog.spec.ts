import {
  MAIL_FAILURES_WINDOW_MS,
  MAIL_STALLED_AFTER_MS,
  type MailBacklog,
  mailBacklogAlarmKey,
  mailBacklogAlarms,
  mailBacklogCriteria,
  oldestStalledMinutes,
} from "../mail-backlog.js";
import { MAIL_RESUME_WINDOW_MS, MAX_MAIL_ATTEMPTS } from "../../entities/mail-request.js";

// L'instant n'est comparé qu'à des instants dérivés de lui : jamais à l'horloge.
const NOW = new Date("2026-11-07T10:42:00.000Z");
const MINUTE_MS = 60_000;

function backlog(overrides: Partial<MailBacklog> = {}): MailBacklog {
  return { stalled: 0, oldestStalledAt: null, definitiveFailures: 0, ...overrides };
}

function waitingFor(ms: number, count = 1): MailBacklog {
  return backlog({ stalled: count, oldestStalledAt: new Date(NOW.getTime() - ms) });
}

describe("la veille du courrier — les seuils (plan § 25)", () => {
  it("aucune demande : rien ne sonne", () => {
    expect(mailBacklogAlarms(backlog(), NOW)).toEqual([]);
  });

  it("sous le seuil de 15 min : rien ne sonne", () => {
    expect(mailBacklogAlarms(waitingFor(MAIL_STALLED_AFTER_MS - MINUTE_MS), NOW)).toEqual([]);
  });

  it("au seuil exact : la file coincée sonne", () => {
    expect(mailBacklogAlarms(waitingFor(MAIL_STALLED_AFTER_MS, 3), NOW)).toEqual([
      { kind: "stalled", count: 3, minutes: 15 },
    ]);
  });

  it("au-dessus : sonne avec l'âge de la plus vieille, en minutes", () => {
    expect(mailBacklogAlarms(waitingFor(42 * MINUTE_MS, 7), NOW)).toEqual([
      { kind: "stalled", count: 7, minutes: 42 },
    ]);
  });

  it("un seul échec définitif suffit ; la file passe avant les échecs", () => {
    const both = { ...waitingFor(20 * MINUTE_MS), definitiveFailures: 1 };
    expect(mailBacklogAlarms(both, NOW).map((alarm) => alarm.kind)).toEqual(["stalled", "failed"]);
  });

  it("une clé par cas et par heure : deux passages de la même heure se confondent", () => {
    const alarm = { kind: "failed", count: 2 } as const;
    const later = new Date(NOW.getTime() + 15 * MINUTE_MS);
    const nextHour = new Date(NOW.getTime() + 20 * MINUTE_MS);
    expect(mailBacklogAlarmKey(alarm, NOW)).toBe(mailBacklogAlarmKey(alarm, later));
    expect(mailBacklogAlarmKey(alarm, NOW)).not.toBe(mailBacklogAlarmKey(alarm, nextHour));
    expect(mailBacklogAlarmKey(alarm, NOW)).not.toBe(
      mailBacklogAlarmKey({ kind: "stalled", count: 1, minutes: 20 }, NOW),
    );
  });

  it("les critères reprennent la fenêtre et le plafond de l'agrégat", () => {
    expect(mailBacklogCriteria(NOW)).toEqual({
      stalledBefore: new Date(NOW.getTime() - MAIL_STALLED_AFTER_MS),
      failedSince: new Date(NOW.getTime() - MAIL_FAILURES_WINDOW_MS),
      resumableSince: new Date(NOW.getTime() - MAIL_RESUME_WINDOW_MS),
      maxAttempts: MAX_MAIL_ATTEMPTS,
    });
  });

  it("l'âge vaut null quand rien n'attend", () => {
    expect(oldestStalledMinutes(backlog(), NOW)).toBeNull();
  });
});
