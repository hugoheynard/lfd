import { localToInstant } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { ProductionCloseSettings } from "../../../domain/entities/production-close-settings.js";
import { ProductionDayEmptyError } from "../../../domain/errors/production-errors.js";
import {
  AutoCloseAttempts,
  type AutoCloseOutcome,
} from "../../../domain/ports/auto-close-attempts.js";
import { AutoCloseRoundReader } from "../../../domain/ports/auto-close-round.reader.js";
import { AutomaticDayCloser } from "../../../domain/ports/automatic-day-closer.js";
import type { AttemptTrace } from "../../../domain/services/auto-close-round.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import {
  ClosedDaysTable,
  SettingsReader,
  SettingsTable,
} from "../../__tests__/settings-doubles.js";
import { PlanArrestBell } from "../../services/plan-arrest-bell.js";
import { RunAutoCloseRoundHandler } from "../run-auto-close-round.handler.js";

/** Un mardi de la maison : les dates sont le SUJET, comparées à une horloge fixée. */
const TODAY = "2026-10-06";
const TOMORROW = "2026-10-07";

function at(time: string, day = TODAY): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${day} ${time}`);
  }
  return instant;
}

function order(orderId: string): ProducibleOrder {
  return {
    orderId,
    reference: orderId,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 4 }],
  };
}

/** Le fournil doublé : les journées arrêtées et la trace des tentatives, ensemble. */
class Fournil extends AutoCloseRoundReader {
  readonly closedPlans = new Set<string>();
  readonly attempts = new Map<string, AutoCloseOutcome>();
  readonly attemptedAt = new Map<string, Date>();

  isPlanClosed(day: ServiceDay): Promise<boolean> {
    return Promise.resolve(this.closedPlans.has(day.value));
  }

  attemptOf(day: ServiceDay): Promise<AttemptTrace | null> {
    const outcome = this.attempts.get(day.value);
    const attemptedAt = this.attemptedAt.get(day.value);
    return Promise.resolve(
      outcome === undefined || attemptedAt === undefined ? null : { outcome, attemptedAt },
    );
  }
}

class Attempts extends AutoCloseAttempts {
  readonly failures = new Map<string, string | null>();
  /** Vrai : une autre instance a pris la tentative entre la lecture et l'insertion. */
  lost = false;

  constructor(private readonly fournil: Fournil) {
    super();
  }

  claim(day: ServiceDay, at: Date): Promise<boolean> {
    if (this.lost || this.fournil.attempts.has(day.value)) {
      return Promise.resolve(false);
    }
    this.fournil.attempts.set(day.value, "pending");
    this.fournil.attemptedAt.set(day.value, at);
    return Promise.resolve(true);
  }

  settle(
    day: ServiceDay,
    outcome: Exclude<AutoCloseOutcome, "pending">,
    failure: string | null,
  ): Promise<void> {
    this.fournil.attempts.set(day.value, outcome);
    this.failures.set(day.value, failure);
    return Promise.resolve();
  }
}

/** Le commerce doublé : les commandes productibles par journée, et le compte des questions. */
class Commerce extends DayOrdersReader {
  readonly orders = new Map<string, readonly ProducibleOrder[]>();
  readonly asked: string[] = [];

  producibleFor(day: ServiceDay): Promise<readonly ProducibleOrder[]> {
    this.asked.push(day.value);
    return Promise.resolve(this.orders.get(day.value) ?? []);
  }
}

/** La vraie clôture doublée : arrête si la journée porte des commandes, refuse sinon. */
class Closer extends AutomaticDayCloser {
  readonly closed: string[] = [];
  failure: Error | null = null;

  constructor(
    private readonly fournil: Fournil,
    private readonly commerce: Commerce,
  ) {
    super();
  }

  close(day: ServiceDay): Promise<void> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    if ((this.commerce.orders.get(day.value) ?? []).length === 0) {
      return Promise.reject(new ProductionDayEmptyError(day.value));
    }
    this.closed.push(day.value);
    this.fournil.closedPlans.add(day.value);
    return Promise.resolve();
  }
}

/** La cloche doublée : l'unicité de la clé d'idempotence, comme la vraie table. */
class Bell extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    for (const notice of notices) {
      if (!this.notices.some((kept) => kept.idempotencyKey === notice.idempotencyKey)) {
        this.notices.push(notice);
      }
    }
    return Promise.resolve();
  }
}

function subject(time: string) {
  const settings = new SettingsTable();
  const closedDays = new ClosedDaysTable();
  const fournil = new Fournil();
  const commerce = new Commerce();
  const closer = new Closer(fournil, commerce);
  const bell = new Bell();
  const clock = new FixedClock(at(time));
  const attempts = new Attempts(fournil);
  const handler = new RunAutoCloseRoundHandler(
    clock,
    new SettingsReader(settings, closedDays),
    fournil,
    attempts,
    commerce,
    closer,
    new PlanArrestBell(bell),
  );
  const setMode = (mode: "auto" | "manual"): void => {
    const row = ProductionCloseSettings.initial();
    row.change({ mode, closeAt: "21:00", alertAt: "20:00" }, null, "fiche_1", clock.now());
    settings.row = row;
  };
  return { handler, fournil, commerce, closer, bell, clock, closedDays, attempts, setMode };
}

describe("le tour en mode automatique", () => {
  it("arrête le plan du lendemain passé l'heure, une seule fois", async () => {
    const s = subject("21:02");
    s.setMode("auto");
    s.commerce.orders.set(TOMORROW, [order("o1")]);

    const first = await s.handler.execute();
    s.fournil.closedPlans.delete(TOMORROW); // même s'il se rouvrait, la trace tient
    const second = await s.handler.execute();

    expect(first).toEqual({ tomorrow: TOMORROW, outcome: "closed", todayOverdue: false });
    expect(second.outcome).toBe("nothing");
    expect(s.closer.closed).toEqual([TOMORROW]);
    expect(s.fournil.attempts.get(TOMORROW)).toBe("closed");
    expect(s.bell.notices).toEqual([]);
  });

  it("ne fait rien avant l'heure réglée", async () => {
    const s = subject("20:55");
    s.setMode("auto");
    s.commerce.orders.set(TOMORROW, [order("o1")]);

    expect((await s.handler.execute()).outcome).toBe("nothing");
    expect(s.fournil.attempts.size).toBe(0);
  });

  it("lendemain vide : trace `empty`, « rien à arrêter » une fois, plus de tentative", async () => {
    const s = subject("21:00");
    s.setMode("auto");

    await s.handler.execute();
    s.clock.advanceMs(5 * 60 * 1000);
    await s.handler.execute();

    expect(s.fournil.attempts.get(TOMORROW)).toBe("empty");
    expect(s.bell.notices.map((notice) => [notice.kind, notice.idempotencyKey])).toEqual([
      [
        "production.plan_nothing_to_arrest",
        `notification:production.plan_nothing_to_arrest:${TOMORROW}`,
      ],
    ]);
    expect(s.bell.notices[0]).toMatchObject({
      subject: "Rien à arrêter pour le mercredi 7 octobre : aucune commande",
      audience: "production_count_stop:write",
      link: "/production/previsionnel",
    });
  });

  it("une autre panne : trace `failed` et son message, une alerte, pas de nouvelle tentative", async () => {
    const s = subject("21:00");
    s.setMode("auto");
    s.commerce.orders.set(TOMORROW, [order("o1")]);
    s.closer.failure = new TypeError("Stripe injoignable");

    expect((await s.handler.execute()).outcome).toBe("failed");
    s.closer.failure = null;
    expect((await s.handler.execute()).outcome).toBe("nothing");

    expect(s.attempts.failures.get(TOMORROW)).toBe("Stripe injoignable");
    expect(s.closer.closed).toEqual([]);
    expect(s.bell.notices).toHaveLength(1);
    expect(s.bell.notices[0]).toMatchObject({
      kind: "production.plan_not_arrested",
      subject: "Le plan du mercredi 7 octobre n'est pas arrêté",
    });
    expect(s.bell.notices[0]?.body).toContain("Stripe injoignable");
  });

  it("une instance qui perd la prise ne tente rien", async () => {
    const s = subject("21:00");
    s.setMode("auto");
    s.commerce.orders.set(TOMORROW, [order("o1")]);
    s.attempts.lost = true;

    expect((await s.handler.execute()).outcome).toBe("nothing");
    expect(s.closer.closed).toEqual([]);
  });

  it("jour fermé : ni arrêt, ni alerte, ni question au commerce", async () => {
    const s = subject("22:00");
    s.setMode("auto");
    s.closedDays.days.set(TOMORROW, "fiche_1");

    expect((await s.handler.execute()).outcome).toBe("nothing");
    expect(s.fournil.attempts.size).toBe(0);
    expect(s.bell.notices).toEqual([]);
    expect(s.commerce.asked).toEqual([TODAY]);
  });

  it("le jour fermé se lit pour le lendemain seulement", async () => {
    const s = subject("22:00");
    s.setMode("auto");
    s.closedDays.days.set("2026-10-08", "fiche_1");
    s.commerce.orders.set(TOMORROW, [order("o1")]);

    expect((await s.handler.execute()).outcome).toBe("closed");
  });
});

describe("la tentative restée en suspens (Q8)", () => {
  /** Le processus est mort entre la prise et l'issue : la trace dit `pending` depuis `minutes`. */
  function stalledSince(s: ReturnType<typeof subject>, minutes: number): void {
    s.fournil.attempts.set(TOMORROW, "pending");
    s.fournil.attemptedAt.set(TOMORROW, new Date(s.clock.now().getTime() - minutes * 60 * 1000));
  }

  it("au-delà de quinze minutes : une alerte dédiée, une seule, sans retentative", async () => {
    const s = subject("21:20");
    s.setMode("auto");
    s.commerce.orders.set(TOMORROW, [order("o1")]);
    stalledSince(s, 16);

    expect((await s.handler.execute()).outcome).toBe("stalled");
    s.clock.advanceMs(5 * 60 * 1000);
    expect((await s.handler.execute()).outcome).toBe("stalled");

    expect(s.closer.closed).toEqual([]);
    expect(s.fournil.attempts.get(TOMORROW)).toBe("pending");
    expect(s.bell.notices).toHaveLength(1);
    expect(s.bell.notices[0]).toMatchObject({
      kind: "production.plan_auto_close_stalled",
      idempotencyKey: `notification:production.plan_auto_close_stalled:${TOMORROW}`,
      audience: "production_count_stop:write",
      subject: "L'arrêt automatique du plan du mercredi 7 octobre n'a pas abouti",
    });
    expect(s.bell.notices[0]?.body).toContain("arrêtez-le à la main");
  });

  it("avant quinze minutes : rien encore", async () => {
    const s = subject("21:10");
    s.setMode("auto");
    stalledSince(s, 10);

    expect((await s.handler.execute()).outcome).toBe("nothing");
    expect(s.bell.notices).toEqual([]);
  });

  it("arrêtée entre-temps à la main : pas d'alerte", async () => {
    const s = subject("21:20");
    s.setMode("auto");
    stalledSince(s, 16);
    s.fournil.closedPlans.add(TOMORROW);

    expect((await s.handler.execute()).outcome).toBe("nothing");
    expect(s.bell.notices).toEqual([]);
  });
});

describe("le tour en mode manuel", () => {
  it("part du réglage initial (manuel, 20:00) : alerte si le lendemain porte des commandes", async () => {
    const s = subject("20:05");
    s.commerce.orders.set(TOMORROW, [order("o1")]);

    await s.handler.execute();
    await s.handler.execute();

    expect(s.closer.closed).toEqual([]);
    expect(s.bell.notices.map((notice) => notice.idempotencyKey)).toEqual([
      `notification:production.plan_not_arrested:${TOMORROW}`,
    ]);
    expect(s.bell.notices[0]?.body).toContain("L'heure d'alerte est passée");
  });

  it("n'alerte pas un lendemain vide, ni avant l'heure", async () => {
    const empty = subject("21:00");
    await empty.handler.execute();
    const early = subject("19:55");
    early.commerce.orders.set(TOMORROW, [order("o1")]);
    await early.handler.execute();

    expect([...empty.bell.notices, ...early.bell.notices]).toEqual([]);
  });

  it("ne demande pas au commerce le lendemain avant l'heure", async () => {
    const s = subject("19:55");

    await s.handler.execute();

    expect(s.commerce.asked).toEqual([TODAY]);
  });
});

describe("le rattrapage d'aujourd'hui (S4)", () => {
  it("alerte une fois si le plan d'aujourd'hui porte des commandes sans être arrêté — sans l'arrêter", async () => {
    const s = subject("06:10");
    s.setMode("auto");
    s.commerce.orders.set(TODAY, [order("o1")]);

    const report = await s.handler.execute();
    await s.handler.execute();

    expect(report.todayOverdue).toBe(true);
    expect(s.closer.closed).toEqual([]);
    expect(s.bell.notices).toHaveLength(1);
    expect(s.bell.notices[0]).toMatchObject({
      kind: "production.plan_today_not_arrested",
      idempotencyKey: `notification:production.plan_today_not_arrested:${TODAY}`,
      subject: "Le plan d'aujourd'hui n'a pas été arrêté",
    });
    expect(s.bell.notices[0]?.body).toContain("mardi 6 octobre");
  });

  it("se tait quand le plan d'aujourd'hui est arrêté — sans demander au commerce", async () => {
    const s = subject("06:10");
    s.commerce.orders.set(TODAY, [order("o1")]);
    s.fournil.closedPlans.add(TODAY);

    expect((await s.handler.execute()).todayOverdue).toBe(false);
    expect(s.commerce.asked).toEqual([]);
  });
});
