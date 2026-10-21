import { TransferReceivedFact } from "../../../../delivery/channels/commerce/index.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import type { SiteResupplySnapshot } from "../../domain/site-resupply.js";
import {
  ResupplyNotArrivableError,
  SiteResupplyNotFoundError,
} from "../../domain/site-resupply-errors.js";
import { MarkArrivedOnTransferReceived } from "../mark-arrived-on-transfer-received.handler.js";
import { MarkResupplyMountedCommand } from "../mark-resupply-mounted.command.js";
import { MarkResupplyMountedHandler } from "../mark-resupply-mounted.handler.js";
import { ResupplyArrivedBell } from "../resupply-arrived-bell.js";
import { Directory } from "./resupply-doubles.js";
import { InMemorySiteResupplies, KnownReceptions, SiteLabels } from "./site-resupply-doubles.js";

/**
 * « Réassort arrivé » (lot R3e) : « Monté » au fournil pour un point servi
 * sur place, la réception du transfert pour un point servi par transfert —
 * et la même cloche au comptoir. Des instants comparés entre eux seulement.
 */
const PLACED_AT = new Date(1_000);
const RECEIVED_AT = new Date(5_000);
const NOW = new Date(9_000);
const LABO = "site_labo";
const VILLAGE = "site_village";
const LOU = { staffUserId: "staff_lou", name: "Lou", role: "counter" };

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

function placed(
  id: string,
  siteId: string,
  overrides: Partial<SiteResupplySnapshot> = {},
): SiteResupplySnapshot {
  return {
    id,
    siteId,
    target: "tomorrow",
    serviceDay: "2030-03-12",
    version: 2,
    origin: "bakehouse",
    name: "Vitrine du matin",
    lines: [
      { sku: "CRO", label: "Croissant", quantity: 12 },
      { sku: "PAC", label: "Pain au chocolat", quantity: 6 },
    ],
    placed: { at: PLACED_AT, author: LOU },
    cancelled: null,
    arrived: null,
    ...overrides,
  };
}

function world() {
  const resupplies = new InMemorySiteResupplies();
  const receptions = new KnownReceptions();
  const labels = new SiteLabels(
    new Map([
      [LABO, "Labo"],
      [VILLAGE, "Val Village"],
    ]),
  );
  const staff = new Directory({ name: "Paul", role: "bakery" });
  const notifier = new RecordingNotifier();
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  const bell = new ResupplyArrivedBell(notifier, afterCommit, work);
  const mounted = new MarkResupplyMountedHandler(
    resupplies,
    receptions,
    labels,
    staff,
    new FixedClock(NOW),
    bell,
    new DirectUnitOfWork(),
  );
  const onTransfer = new MarkArrivedOnTransferReceived(resupplies, receptions, labels, staff, bell);
  const rung = async (): Promise<readonly StaffNotice[]> => {
    await afterCommit.commit();
    await work.whenIdle();
    return notifier.notices;
  };
  return { resupplies, receptions, mounted, onTransfer, rung, afterCommit };
}

function transferReceived(resupplyIds: readonly string[]): DurableDelivery {
  const fact = new TransferReceivedFact(
    "t_1",
    VILLAGE,
    "2030-03-12",
    RECEIVED_AT,
    "staff_driver",
    resupplyIds,
  ).durableFact();
  return { eventId: "evt_1", type: fact.type, payload: fact.payload };
}

describe("« Monté » (R3e, point servi sur place)", () => {
  it("passe le réassort à arrivé, signé du fournil, et sonne au comptoir après la validation", async () => {
    const { resupplies, mounted, rung, afterCommit } = world();
    resupplies.put(placed("rs_1", LABO));

    await mounted.execute(new MarkResupplyMountedCommand(LABO, "rs_1", "staff_paul"));

    expect(resupplies.all()[0]?.arrived).toEqual({
      at: NOW,
      author: { staffUserId: "staff_paul", name: "Paul", role: "bakery" },
    });
    afterCommit.discard();
    expect(await rung()).toEqual([]);
  });

  it("la cloche : à qui tient le comptoir, au nom du réassort et du point, une clé par réassort", async () => {
    const { resupplies, mounted, rung } = world();
    resupplies.put(placed("rs_1", LABO));

    await mounted.execute(new MarkResupplyMountedCommand(LABO, "rs_1", "staff_paul"));

    expect(await rung()).toEqual([
      {
        kind: "resupply.arrived",
        subject: "Réassort arrivé — à réceptionner : Vitrine du matin — Labo",
        body: expect.stringContaining("18 pièces sur 2 articles") as string,
        link: "/comptoir/reassort",
        idempotencyKey: "notification:resupply.arrived:rs_1",
        occurredAt: NOW,
        audience: "handover_counter:read",
      },
    ]);
  });

  it("un second « Monté » ne change rien et ne sonne pas", async () => {
    const { resupplies, mounted, rung } = world();
    resupplies.put(placed("rs_1", LABO));
    await mounted.execute(new MarkResupplyMountedCommand(LABO, "rs_1", "staff_paul"));

    await mounted.execute(new MarkResupplyMountedCommand(LABO, "rs_1", "staff_paul"));

    expect(resupplies.saves).toBe(1);
    expect(await rung()).toHaveLength(1);
  });

  it("déjà réceptionné : rien ne change, rien ne sonne", async () => {
    const { resupplies, receptions, mounted, rung } = world();
    resupplies.put(placed("rs_1", LABO));
    receptions.receive(LABO, "rs_1", { at: RECEIVED_AT, author: LOU });

    await mounted.execute(new MarkResupplyMountedCommand(LABO, "rs_1", "staff_paul"));

    expect(resupplies.all()[0]?.arrived).toBeNull();
    expect(await rung()).toEqual([]);
  });

  it("refuse un réassort annulé, et celui d'un autre point est introuvable", async () => {
    const { resupplies, mounted } = world();
    resupplies.put(placed("rs_1", LABO, { cancelled: { at: RECEIVED_AT, author: LOU } }));
    resupplies.put(placed("rs_2", VILLAGE));

    await expect(
      mounted.execute(new MarkResupplyMountedCommand(LABO, "rs_1", "staff_paul")),
    ).rejects.toThrow(ResupplyNotArrivableError);
    await expect(
      mounted.execute(new MarkResupplyMountedCommand(LABO, "rs_2", "staff_paul")),
    ).rejects.toThrow(SiteResupplyNotFoundError);
  });
});

describe("la réception du transfert (R3e, point servi par transfert)", () => {
  it("passe ses réassorts à arrivé, à l'instant et sous l'auteur de la réception", async () => {
    const { resupplies, onTransfer, rung } = world();
    resupplies.put(placed("rs_1", VILLAGE));
    resupplies.put(placed("rs_2", VILLAGE, { name: null }));

    await onTransfer.handle(transferReceived(["rs_1", "rs_2"]));

    expect(resupplies.all().map((row) => row.arrived?.at)).toEqual([RECEIVED_AT, RECEIVED_AT]);
    expect(resupplies.all()[0]?.arrived?.author.staffUserId).toBe("staff_driver");
    expect((await rung()).map((notice) => notice.subject)).toEqual([
      "Réassort arrivé — à réceptionner : Vitrine du matin — Val Village",
      "Réassort arrivé — à réceptionner : Val Village",
    ]);
  });

  it("rejoué, il ne change rien et ne sonne pas une seconde fois", async () => {
    const { resupplies, onTransfer, rung } = world();
    resupplies.put(placed("rs_1", VILLAGE));
    await onTransfer.handle(transferReceived(["rs_1"]));

    await onTransfer.handle(transferReceived(["rs_1"]));

    expect(resupplies.saves).toBe(1);
    expect(await rung()).toHaveLength(1);
  });

  it("écarte sans lever un réassort introuvable, annulé, ou d'un autre point", async () => {
    const { resupplies, onTransfer, rung } = world();
    resupplies.put(placed("rs_1", VILLAGE, { cancelled: { at: RECEIVED_AT, author: LOU } }));
    resupplies.put(placed("rs_2", LABO));

    await onTransfer.handle(transferReceived(["rs_1", "rs_2", "rs_absent"]));

    expect(resupplies.saves).toBe(0);
    expect(await rung()).toEqual([]);
  });

  it("un transfert sans réassort ne touche à rien", async () => {
    const { resupplies, onTransfer } = world();

    await onTransfer.handle(transferReceived([]));

    expect(resupplies.saves).toBe(0);
  });
});
