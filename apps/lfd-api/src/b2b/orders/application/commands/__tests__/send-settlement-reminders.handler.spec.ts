import { localToInstant, type OrderCutoffView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { OrderCutoffReader } from "../../../domain/ports/order-cutoff.reader.js";
import {
  UnpaidLinkOrderReader,
  type UnpaidLinkOrder,
} from "../../../domain/ports/unpaid-link-order.reader.js";
import { SendSettlementRemindersHandler } from "../send-settlement-reminders.handler.js";

/**
 * Les dates ne sont comparées qu'entre elles — la journée, la limite et le
 * `FixedClock` sont construits les uns à partir des autres, jamais contre
 * l'horloge (CLAUDE.md §5, l'exception étroite).
 */
const DAY = "2030-03-12";
const EVE = "2030-03-11";

function at(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure inexistante : ${day} ${time}`);
  }
  return instant;
}

const DEFAULT_RULE: OrderCutoffView = {
  id: "cut_1",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "18:00",
  graceMinutes: 0,
};

class Orders extends UnpaidLinkOrderReader {
  constructor(private readonly found: readonly UnpaidLinkOrder[]) {
    super();
  }

  awaitingSettlement(): Promise<readonly UnpaidLinkOrder[]> {
    return Promise.resolve(this.found);
  }
}

class Cutoffs extends OrderCutoffReader {
  reads = 0;

  constructor(private readonly rules: readonly OrderCutoffView[]) {
    super();
  }

  list(): Promise<readonly OrderCutoffView[]> {
    this.reads += 1;
    return Promise.resolve(this.rules);
  }
}

/** Une cloche qui, comme la vraie, écarte un doublon par sa clé. */
class DedupingNotifier extends StaffNotifier {
  readonly rung: StaffNotice[] = [];
  calls = 0;

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.calls += 1;
    for (const notice of notices) {
      if (!this.rung.some((seen) => seen.idempotencyKey === notice.idempotencyKey)) {
        this.rung.push(notice);
      }
    }
    return Promise.resolve();
  }
}

const order = (over: Partial<UnpaidLinkOrder> = {}): UnpaidLinkOrder => ({
  orderId: "order_1",
  orderNumber: "CMD-1",
  companyName: "Hôtel des Trois Ponts",
  serviceDay: DAY,
  placedAt: at(EVE, "09:00"),
  ...over,
});

function passAt(
  now: Date,
  found: readonly UnpaidLinkOrder[],
  rules: readonly OrderCutoffView[] = [DEFAULT_RULE],
  notifier = new DedupingNotifier(),
) {
  const cutoffs = new Cutoffs(rules);
  const handler = new SendSettlementRemindersHandler(
    new Orders(found),
    cutoffs,
    notifier,
    new FixedClock(now),
  );
  return { handler, notifier, cutoffs };
}

describe("SendSettlementRemindersHandler (Q6)", () => {
  it("sonne pour un lien non réglé passé l'heure limite : qui, laquelle, le geste", async () => {
    const now = at(EVE, "19:00");
    const { handler, notifier } = passAt(now, [order()]);

    expect(await handler.execute()).toEqual({ overdue: 1 });
    expect(notifier.rung).toEqual([
      {
        kind: "order.settlement_overdue",
        subject: "Lien de paiement non réglé — Hôtel des Trois Ponts",
        body:
          "Commande CMD-1 pas réglée à l'heure limite : relancer le client avant la fournée, " +
          "sinon elle sera annulée à la clôture.",
        link: "/commandes/order_1",
        idempotencyKey: "notification:order.settlement_overdue:order_1",
        occurredAt: now,
      },
    ]);
  });

  it("ne fait rien avant l'heure limite", async () => {
    const { handler, notifier } = passAt(at(EVE, "17:00"), [order()]);

    expect(await handler.execute()).toEqual({ overdue: 0 });
    expect(notifier.calls).toBe(0);
  });

  it("ne fait rien sans règle d'heure limite", async () => {
    const { handler, notifier } = passAt(at(DAY, "12:00"), [order()], []);

    expect(await handler.execute()).toEqual({ overdue: 0 });
    expect(notifier.calls).toBe(0);
  });

  it("ne sonne qu'une fois par commande, tour après tour", async () => {
    const notifier = new DedupingNotifier();
    await passAt(at(EVE, "19:00"), [order()], [DEFAULT_RULE], notifier).handler.execute();
    await passAt(at(EVE, "20:00"), [order()], [DEFAULT_RULE], notifier).handler.execute();

    expect(notifier.rung).toHaveLength(1);
    expect(notifier.rung[0]?.occurredAt).toEqual(at(EVE, "19:00"));
  });

  it("trie par journée : seule celle dont la limite est passée sonne", async () => {
    const late = order({ orderId: "order_late", orderNumber: "CMD-LATE" });
    const later = order({ orderId: "order_later", serviceDay: "2030-03-20" });
    const { handler, notifier } = passAt(at(EVE, "19:00"), [late, later]);

    expect(await handler.execute()).toEqual({ overdue: 1 });
    expect(notifier.rung.map((notice) => notice.link)).toEqual(["/commandes/order_late"]);
  });

  it("sans jour de retrait, rattache la commande à son jour de passation (Q5)", async () => {
    const undated = order({ serviceDay: null, placedAt: at(DAY, "08:00") });
    const { handler } = passAt(at(DAY, "09:00"), [undated]);

    // Limite du 12 = le 11 à 18 h : passée.
    expect(await handler.execute()).toEqual({ overdue: 1 });
  });

  it("nomme la commande quand elle n'a pas de société", async () => {
    const { handler, notifier } = passAt(at(EVE, "19:00"), [order({ companyName: null })]);
    await handler.execute();

    expect(notifier.rung[0]?.subject).toBe("Lien de paiement non réglé — CMD-1");
  });

  it("sans candidate, ne lit même pas les règles", async () => {
    const { handler, cutoffs } = passAt(at(EVE, "19:00"), []);

    expect(await handler.execute()).toEqual({ overdue: 0 });
    expect(cutoffs.reads).toBe(0);
  });
});
