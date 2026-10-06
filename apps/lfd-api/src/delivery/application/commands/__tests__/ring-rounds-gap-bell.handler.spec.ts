import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DeliveryDayReadinessReader,
  type DeliveryDayReadinessRow,
} from "../../../domain/ports/delivery-day-readiness.reader.js";
import { RingRoundsGapBellHandler } from "../ring-rounds-gap-bell.handler.js";
import { RecordingStaffNotifier } from "./decision-doubles.js";

// Les jours se comparent à l'horloge FIXÉE, jamais au mur : 6 octobre, Paris (UTC+2).
const TODAY = "2026-10-06";
const TOMORROW = "2026-10-07";
const AT_15H = new Date("2026-10-06T13:00:00.000Z");
const AT_16H = new Date("2026-10-06T14:00:00.000Z");
const CLOSED = new Date("2026-10-05T18:00:00.000Z");

class DaysReadiness extends DeliveryDayReadinessReader {
  readonly asked: string[] = [];

  constructor(private readonly rows: Readonly<Record<string, DeliveryDayReadinessRow>>) {
    super();
  }

  readinessOf(serviceDay: string): Promise<DeliveryDayReadinessRow | null> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.rows[serviceDay] ?? null);
  }
}

function arrested(unplacedCount: number): DeliveryDayReadinessRow {
  return { closedAt: CLOSED, deliveryCount: 5, unplacedCount };
}

function scene(rows: Readonly<Record<string, DeliveryDayReadinessRow>>, at: Date) {
  const readiness = new DaysReadiness(rows);
  const notifier = new RecordingStaffNotifier();
  const handler = new RingRoundsGapBellHandler(readiness, notifier, new FixedClock(at));
  return { readiness, notifier, run: () => handler.execute() };
}

describe("RingRoundsGapBellHandler — la cloche « hors tournée »", () => {
  it("demain à 16 h, plan arrêté, 3 hors tournée : sonne pour ceux qui composent", async () => {
    const { notifier, run } = scene({ [TOMORROW]: arrested(3) }, AT_16H);

    await expect(run()).resolves.toEqual({ alerted: [TOMORROW] });

    expect(notifier.notified).toEqual([
      {
        kind: "delivery.rounds_gap",
        subject: "Demain, mercredi 7 octobre : 3 livraisons hors tournée",
        body: expect.stringContaining("Proposer les tournées") as unknown,
        link: `/livraison/tournees?jour=${TOMORROW}`,
        idempotencyKey: `notification:delivery.rounds_gap:${TOMORROW}:3`,
        occurredAt: AT_16H,
        audience: "delivery_rounds:write",
      },
    ]);
  });

  it("avant 16 h, demain n'est pas regardé", async () => {
    const { readiness, notifier, run } = scene({ [TOMORROW]: arrested(3) }, AT_15H);

    await expect(run()).resolves.toEqual({ alerted: [] });

    expect(readiness.asked).toEqual([TODAY]);
    expect(notifier.notified).toEqual([]);
  });

  it("aujourd'hui sonne à toute heure", async () => {
    const { notifier, run } = scene({ [TODAY]: arrested(1) }, AT_15H);

    await run();

    expect(notifier.notified.map((notice) => notice.subject)).toEqual([
      "Aujourd'hui, mardi 6 octobre : 1 livraison hors tournée",
    ]);
  });

  it("tout en tournée, ou plan pas arrêté : silence", async () => {
    const { notifier, run } = scene(
      {
        [TODAY]: arrested(0),
        [TOMORROW]: { closedAt: null, deliveryCount: 2, unplacedCount: 2 },
      },
      AT_16H,
    );

    await expect(run()).resolves.toEqual({ alerted: [] });
    expect(notifier.notified).toEqual([]);
  });

  it("la clé suit le compte : un même compte rejoué porte la même clé", async () => {
    const first = scene({ [TOMORROW]: arrested(2) }, AT_16H);
    await first.run();
    await first.run();

    const keys = first.notifier.notified.map((notice) => notice.idempotencyKey);
    expect(new Set(keys)).toEqual(new Set([`notification:delivery.rounds_gap:${TOMORROW}:2`]));
  });
});
