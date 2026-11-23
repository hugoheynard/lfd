import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { SubscriptionAlreadyActiveError } from "../../../domain/errors/subscription-errors.js";
import { SetSubscriptionStatusCommand } from "../set-subscription-status.command.js";
import { SetSubscriptionStatusHandler } from "../set-subscription-status.handler.js";
import { activeSubscription, FakeSubscriptionRepository } from "./fake-subscription-repository.js";
import { SubscriptionNotFoundError } from "../../../domain/errors/subscription-errors.js";
import { subscriptionGestures } from "./subscription-gesture-doubles.js";

function build() {
  const repo = new FakeSubscriptionRepository();
  const events = new RecordingPublisher();
  const handler = new SetSubscriptionStatusHandler(
    repo,
    events,
    new DirectUnitOfWork(),
    subscriptionGestures(repo).gestures,
    // 23 h 30 UTC le 22 novembre : déjà le 23 à Paris.
    new FixedClock(new Date("2026-11-22T23:30:00.000Z")),
  );
  return { repo, events, handler };
}

describe("SetSubscriptionStatusHandler", () => {
  it("404 quand l'abonnement n'est pas au mur (load rend null) — ni écriture, ni fait", async () => {
    const { repo, events, handler } = build();

    await expect(
      handler.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "paused")),
    ).rejects.toBeInstanceOf(SubscriptionNotFoundError);
    expect(repo.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("met en pause un abonnement actif, le sauve, et journalise l'avant et l'après", async () => {
    const { repo, events, handler } = build();
    repo.loadResult = activeSubscription();

    await handler.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "paused"));

    expect(repo.saved[0]?.toPersistence().status).toBe("paused");
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "subscription.status_changed",
        subjectType: "subscription",
        subjectId: "sub_1",
        payload: { before: "active", after: "paused" },
      },
    ]);
  });

  it("la reprise pose la borne du planificateur au jour de PARIS, pas au jour UTC", async () => {
    const { repo, handler } = build();
    const paused = activeSubscription();
    paused.pause();
    repo.loadResult = paused;

    await handler.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "active"));

    expect(repo.saved[0]?.armedSince?.toString()).toBe("2026-11-23");
  });

  it("laisse remonter le refus métier (reprendre un déjà actif), sans fait", async () => {
    const { repo, events, handler } = build();
    repo.loadResult = activeSubscription();

    await expect(
      handler.execute(new SetSubscriptionStatusCommand("user_1", "sub_1", "active")),
    ).rejects.toBeInstanceOf(SubscriptionAlreadyActiveError);
    expect(repo.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });
});
