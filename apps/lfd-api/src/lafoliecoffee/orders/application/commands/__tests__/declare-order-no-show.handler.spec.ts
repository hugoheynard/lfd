import { OpenableUnitOfWork } from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { OrderNoShowSnapshot } from "../../../domain/entities/order-no-show.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  NoShowAlreadyDeclaredError,
  NoShowRefusedError,
  NoShowTooEarlyError,
} from "../../../domain/errors/order-no-show-errors.js";
import { DeclareOrderNoShowCommand } from "../declare-order-no-show.command.js";
import { DeclareOrderNoShowHandler } from "../declare-order-no-show.handler.js";
import {
  FixedHandoverHistory,
  OneOrderNoShow,
  RecordingFacts,
  minutesAfterEnd,
  noShowSnapshot,
} from "./no-show-doubles.js";

/**
 * **« Le client n'est pas venu »** : ce qui s'écrit, ce qui part au journal,
 * ce qui est refusé — et qu'un double clic ne déclare rien deux fois.
 */

function setup(
  options: {
    readonly snapshot?: OrderNoShowSnapshot | null;
    readonly now?: Date;
    readonly attested?: readonly string[];
  } = {},
) {
  const clock = new FixedClock(options.now ?? minutesAfterEnd(30));
  const noShows = new OneOrderNoShow(
    options.snapshot === undefined ? noShowSnapshot() : options.snapshot,
  );
  const facts = new RecordingFacts();
  const handler = new DeclareOrderNoShowHandler(
    noShows,
    new FixedHandoverHistory(options.attested ?? []),
    facts,
    new OncePerIntent(new InMemoryGestureIntentLedger(), clock),
    clock,
    new OpenableUnitOfWork(),
  );
  const run = (key = "key_1", staff = "staff_lea"): Promise<void> =>
    handler.execute(new DeclareOrderNoShowCommand("order_1", staff, key));
  return { run, noShows, facts };
}

describe("DeclareOrderNoShowHandler", () => {
  it("déclare la commande non retirée et publie `order.no_show`, sans e-mail", async () => {
    const subject = setup();

    await subject.run();

    expect(subject.noShows.saved).toEqual([
      expect.objectContaining({
        status: "no_show",
        declared: { at: minutesAfterEnd(30), byStaffId: "staff_lea" },
      }),
    ]);
    expect(subject.facts.facts).toEqual([
      {
        type: "order.no_show",
        key: "order.no_show:order_1",
        payload: {
          orderId: "order_1",
          orderNumber: "ORD-4812",
          placedByUserId: "user_7",
          noShowBy: "staff_lea",
          noShowAt: minutesAfterEnd(30).toISOString(),
        },
      },
    ]);
  });

  it("rejouée avec la même clé, ne déclare ni ne publie une seconde fois", async () => {
    const subject = setup();

    await subject.run("key_1");
    await subject.run("key_1");

    expect(subject.noShows.locks).toBe(1);
    expect(subject.facts.facts).toHaveLength(1);
  });

  it("avec une autre clé sur une commande déjà déclarée, refuse en le disant", async () => {
    const subject = setup();
    await subject.run("key_1");

    await expect(subject.run("key_2", "staff_max")).rejects.toThrow(NoShowAlreadyDeclaredError);
    expect(subject.facts.facts).toHaveLength(1);
  });

  it("refuse avant la fin du créneau, sans rien écrire", async () => {
    const subject = setup({ now: minutesAfterEnd(-5) });

    await expect(subject.run()).rejects.toThrow(NoShowTooEarlyError);
    expect(subject.noShows.saved).toEqual([]);
    expect(subject.facts.facts).toEqual([]);
  });

  it("une clé refusée est rendue : le geste repasse à l'heure", async () => {
    const early = setup({ now: minutesAfterEnd(-5) });
    await expect(early.run("key_1")).rejects.toThrow(NoShowTooEarlyError);

    const later = setup({ now: minutesAfterEnd(5) });
    await later.run("key_1");

    expect(later.facts.facts).toHaveLength(1);
  });

  it("refuse une commande que le retrait atteste remise", async () => {
    const subject = setup({ attested: ["order_1"] });

    await expect(subject.run()).rejects.toThrow("a déjà été retirée");
    expect(subject.noShows.saved).toEqual([]);
  });

  it("refuse une commande qui ne se règle pas à la caisse de la boutique", async () => {
    const subject = setup({ snapshot: noShowSnapshot({ settlementVenue: null }) });

    await expect(subject.run()).rejects.toThrow(NoShowRefusedError);
    expect(subject.facts.facts).toEqual([]);
  });

  it("refuse une commande inconnue", async () => {
    const subject = setup({ snapshot: null });

    await expect(subject.run()).rejects.toThrow(OrderNotFoundError);
  });
});
