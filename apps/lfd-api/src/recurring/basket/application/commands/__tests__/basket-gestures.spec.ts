import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OccurrencePlanner } from "../../../../occurrence/application/services/occurrence-planner.js";
import { Occurrence } from "../../../../occurrence/domain/entities/occurrence.js";
import {
  FixedPickupPoints,
  FixedStanding,
  InMemoryBaskets,
  InMemoryOccurrences,
  RecordingDurable,
} from "../../../../occurrence/application/__tests__/recurring-doubles.js";
import { day, openBasket } from "../../../domain/entities/__tests__/basket-fixtures.js";
import {
  SubscriptionAlreadyActiveError,
  SubscriptionNotFoundError,
  SubscriptionSiteMembershipLostError,
} from "../../../domain/errors/basket-errors.js";
import { BasketFacts } from "../../services/basket-facts.js";
import { BasketGestures } from "../../services/basket-gestures.js";
import { SetBasketStatusCommand } from "../set-basket-status.command.js";
import { SetBasketStatusHandler } from "../set-basket-status.handler.js";
import { StopBasketCommand } from "../stop-basket.command.js";
import { StopBasketHandler } from "../stop-basket.handler.js";

// 23 h 30 UTC le 19 novembre : déjà le 20 à Paris.
const NOW = new Date("2026-11-19T23:30:00.000Z");

function build(members: ReadonlySet<string> = new Set(["user_1/chalet"])) {
  const baskets = new InMemoryBaskets();
  const occurrences = new InMemoryOccurrences();
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const planner = new OccurrencePlanner(occurrences, new FixedIdGenerator("occ"));
  const standing = new FixedStanding(members);
  const gestures = new BasketGestures(baskets, standing);
  const durable = new RecordingDurable();
  const facts = new BasketFacts(standing, durable, new FixedIdGenerator("gesture"));
  const uow = new DirectUnitOfWork();
  const basket = openBasket({ startDate: day("2026-11-02") });
  void baskets.insert(basket);
  for (const serviceDay of ["2026-11-09", "2026-11-16", "2026-11-23"]) {
    void occurrences.insertMany([
      Occurrence.plan({
        id: serviceDay,
        basketId: basket.id,
        serviceDay: day(serviceDay),
        at: NOW,
      }),
    ]);
  }
  return {
    basket,
    baskets,
    occurrences,
    events,
    durable,
    status: new SetBasketStatusHandler(baskets, planner, gestures, facts, events, uow, clock),
    stop: new StopBasketHandler(
      baskets,
      planner,
      gestures,
      facts,
      new FixedPickupPoints(),
      events,
      uow,
      clock,
    ),
  };
}

describe("SetBasketStatusHandler", () => {
  it("la pause ne touche pas les échéances, et se journalise", async () => {
    const { basket, occurrences, events, status } = build();

    await status.execute(new SetBasketStatusCommand("user_1", basket.id, "paused"));

    expect(basket.currentStatus).toBe("paused");
    expect(occurrences.stateOn("2026-11-09")).toBe("planned");
    expect(events.traced.map((event) => event.journalFact().payload)).toEqual([
      { before: "active", after: "paused" },
    ]);
  });

  it("la pause et la reprise écrivent chacune leur fait durable, une clé par geste", async () => {
    const { basket, durable, status } = build();

    await status.execute(new SetBasketStatusCommand("user_1", basket.id, "paused"));
    await status.execute(new SetBasketStatusCommand("user_1", basket.id, "active"));

    expect(durable.types).toEqual(["recurring.basket_paused", "recurring.basket_resumed"]);
    expect(durable.facts.map((fact) => fact.key)).toEqual([
      `recurring.basket_paused:${basket.id}:gesture_000001`,
      `recurring.basket_resumed:${basket.id}:gesture_000002`,
    ]);
    expect(durable.facts[0]?.payload).toMatchObject({
      siteCompanyId: "chalet",
      principalCompanyId: "maison",
    });
  });

  it("la reprise annule aussi une échéance refusée d'avant la pause : elle ne tombera pas manquée", async () => {
    const { basket, occurrences, status } = build();
    const stored = occurrences.rows.get("2026-11-16");
    if (stored === undefined) {
      throw new TypeError("l'échéance du 16 manque au semis");
    }
    const refused = Occurrence.reconstitute(stored);
    refused.refuse("unavailable_sku", "Article indisponible.", false, NOW);
    occurrences.overwrite(refused.snapshot);
    basket.pause();

    await status.execute(new SetBasketStatusCommand("user_1", basket.id, "active"));

    expect(occurrences.stateOn("2026-11-09")).toBe("cancelled");
    expect(occurrences.stateOn("2026-11-16")).toBe("cancelled");
    expect(occurrences.rows.get("2026-11-16")).toMatchObject({
      cause: "unavailable_sku",
    });
  });

  it("la reprise annule les échéances d'avant son jour de PARIS et replanifie", async () => {
    const { basket, occurrences, status } = build();
    basket.pause();

    await status.execute(new SetBasketStatusCommand("user_1", basket.id, "active"));

    expect(occurrences.stateOn("2026-11-16")).toBe("cancelled");
    expect(occurrences.stateOn("2026-11-23")).toBe("planned");
    expect(occurrences.stateOn("2027-01-11")).toBe("planned");
    expect(basket.plannedUntil?.toString()).toBe("2027-01-15");
  });

  it("refuse une reprise d'un panier actif, sans rien écrire", async () => {
    const { basket, baskets, events, status } = build();

    await expect(
      status.execute(new SetBasketStatusCommand("user_1", basket.id, "active")),
    ).rejects.toBeInstanceOf(SubscriptionAlreadyActiveError);
    expect(baskets.saved).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });

  it("404 pour le panier d'un autre, 403 pour une société quittée", async () => {
    const { basket, status } = build(new Set());

    await expect(
      status.execute(new SetBasketStatusCommand("user_2", basket.id, "paused")),
    ).rejects.toBeInstanceOf(SubscriptionNotFoundError);
    await expect(
      status.execute(new SetBasketStatusCommand("user_1", basket.id, "paused")),
    ).rejects.toBeInstanceOf(SubscriptionSiteMembershipLostError);
  });
});

describe("StopBasketHandler", () => {
  it("arrête le panier, annule ses échéances ouvertes, journalise la décision avec le point nommé", async () => {
    const { basket, occurrences, events, durable, stop } = build();

    await stop.execute(new StopBasketCommand("user_1", basket.id));

    expect(basket.lifecycle).toBe("cancelled");
    expect(occurrences.stateOn("2026-11-23")).toBe("cancelled");
    expect(events.factTypes()).toEqual(["subscription.deleted"]);
    expect(durable.facts.map((fact) => fact.key)).toEqual([
      `recurring.basket_stopped:${basket.id}`,
    ]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      pickupAddress: { id: "point_1", name: "Atelier" },
      recurrence: "weekly",
    });
  });

  it("un rejeu répond comme un panier absent", async () => {
    const { basket, stop } = build();
    await stop.execute(new StopBasketCommand("user_1", basket.id));

    await expect(stop.execute(new StopBasketCommand("user_1", basket.id))).rejects.toBeInstanceOf(
      SubscriptionNotFoundError,
    );
  });
});
