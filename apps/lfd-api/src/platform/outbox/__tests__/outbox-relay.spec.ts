import { BackgroundWork } from "../../events/background-work.js";
import { FixedClock } from "../../time/fixed-clock.js";
import { DurableDeliveryGuard } from "../durable-delivery-guard.js";
import { OutboxRelay } from "../outbox-relay.js";
import { MAX_DELIVERY_ATTEMPTS } from "../retry-policy.js";
import {
  CountingSubscriber,
  InMemoryRelayStore,
  RollbackUnitOfWork,
  StaticSubscribers,
} from "./outbox-doubles.js";

const NOW = new Date(1_800_000_000_000);
const TYPE = "test.happened";
const NAME = "test.counter";

function setup(): {
  relay: OutboxRelay;
  store: InMemoryRelayStore;
  subscriber: CountingSubscriber;
  clock: FixedClock;
  work: BackgroundWork;
} {
  const store = new InMemoryRelayStore();
  const subscriber = new CountingSubscriber();
  const clock = new FixedClock(NOW);
  const work = new BackgroundWork();
  const subscribers = new StaticSubscribers({ [TYPE]: [{ name: NAME, handler: subscriber }] });
  const guard = new DurableDeliveryGuard(new RollbackUnitOfWork(store), store);
  return {
    relay: new OutboxRelay(store, subscribers, guard, clock, work),
    store,
    subscriber,
    clock,
    work,
  };
}

const FACT = { eventId: "outbox_1", subscriber: NAME, type: TYPE, payload: { orderId: "o1" } };

describe("le relais de la boîte d'envoi", () => {
  it("livre une livraison due et pose son reçu", async () => {
    const { relay, store, subscriber } = setup();
    store.add(FACT, NOW);

    await expect(relay.sweep()).resolves.toEqual({ delivered: 1, skipped: 0, failed: 0 });

    expect(subscriber.received).toEqual([
      { eventId: "outbox_1", type: TYPE, payload: { orderId: "o1" } },
    ]);
    expect(store.find("outbox_1", NAME)?.deliveredAt).toEqual(NOW);
  });

  it("ne livre pas une livraison dont le prochain essai n'est pas échu", async () => {
    const { relay, store, subscriber } = setup();
    store.add(FACT, new Date(NOW.getTime() + 1000));

    await relay.sweep();

    expect(subscriber.received).toHaveLength(0);
  });

  it("note l'échec, compte l'essai et repousse le suivant", async () => {
    const { relay, store, subscriber } = setup();
    subscriber.failuresLeft = 1;
    store.add(FACT, NOW);

    await expect(relay.sweep()).resolves.toEqual({ delivered: 0, skipped: 0, failed: 1 });

    expect(store.find("outbox_1", NAME)).toMatchObject({
      attempts: 1,
      nextAttemptAt: new Date(NOW.getTime() + 30_000),
      lastError: "abonné en panne",
      claimedUntil: null,
      deliveredAt: null,
    });
  });

  it("rejoue un abonné en échec une fois son délai échu", async () => {
    const { relay, store, subscriber, clock } = setup();
    subscriber.failuresLeft = 1;
    store.add(FACT, NOW);
    await relay.sweep();

    clock.advanceMs(30_000);
    await relay.sweep();

    expect(subscriber.received).toHaveLength(1);
  });

  it("ne réserve plus une lettre morte", async () => {
    const { relay, store, subscriber } = setup();
    store.add(FACT, NOW, MAX_DELIVERY_ATTEMPTS);

    await relay.sweep();

    expect(subscriber.received).toHaveLength(0);
  });

  it("saute une livraison déjà reçue sans rappeler l'abonné", async () => {
    const { relay, store, subscriber } = setup();
    store.add(FACT, NOW);
    const row = store.find("outbox_1", NAME);
    if (row === undefined) {
      throw new TypeError("livraison absente");
    }
    // Un relais concurrent a posé le reçu entre la réservation et la livraison.
    const claimed = await store.claim({ now: NOW, leaseUntil: NOW, limit: 1, maxAttempts: 10 });
    row.claimedUntil = null;
    row.deliveredAt = NOW;
    const guard = new DurableDeliveryGuard(new RollbackUnitOfWork(store), store);

    await expect(
      guard.deliver(claimed[0] ?? row.claimed, { name: NAME, handler: subscriber }, NOW),
    ).resolves.toBe(false);
    expect(subscriber.received).toHaveLength(0);
    await expect(relay.sweep()).resolves.toEqual({ delivered: 0, skipped: 0, failed: 0 });
  });

  it("note un échec quand l'abonné n'est plus inscrit, plutôt que de perdre la livraison", async () => {
    const { relay, store } = setup();
    store.add({ ...FACT, subscriber: "retired.subscriber" }, NOW);

    await expect(relay.sweep()).resolves.toEqual({ delivered: 0, skipped: 0, failed: 1 });
    expect(store.find("outbox_1", "retired.subscriber")?.lastError).toContain("retired.subscriber");
  });

  it("s'inscrit au travail de fond quand on le réveille, pour que drain() l'attende", async () => {
    const { relay, store, subscriber, work } = setup();
    store.add(FACT, NOW);

    relay.wake();
    await work.whenIdle();

    expect(subscriber.received).toHaveLength(1);
  });
});
