import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import {
  MAX_DELIVERY_ATTEMPTS,
  retryDelayMs,
} from "../../../../../platform/outbox/retry-policy.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { verifyVitrineSignature } from "../../../domain/services/vitrine-signature.js";
import { catalogue, item } from "../../../domain/__tests__/vitrine-fixtures.js";
import { VitrineSubscriber } from "../../../domain/vitrine-subscriber.js";
import { VitrineRelay } from "../../services/vitrine-relay.js";
import { VitrineShowcaseLoader } from "../../services/vitrine-showcase.loader.js";
import { SweepVitrineHandler } from "../sweep-vitrine.handler.js";
import {
  MemoryDeliveries,
  MemoryPrints,
  MemorySubscribers,
  ScriptedPoster,
  StaticShowcase,
  testCipher,
  testMint,
} from "./vitrine-doubles.js";

const START = new Date(0);
const FIVE_MINUTES = 5 * 60 * 1000;

function world(...subscribers: VitrineSubscriber[]) {
  const clock = new FixedClock(START);
  const cipher = testCipher();
  const store = new MemorySubscribers(...subscribers);
  const deliveries = new MemoryDeliveries();
  const prints = new MemoryPrints();
  const shop = new StaticShowcase();
  const poster = new ScriptedPoster();
  const sweep = new SweepVitrineHandler(
    store,
    deliveries,
    prints,
    new VitrineShowcaseLoader(shop),
    new VitrineRelay(poster, cipher, clock),
    new FixedIdGenerator("d"),
    clock,
    new DirectUnitOfWork(),
  );
  return { clock, cipher, store, deliveries, prints, shop, poster, sweep };
}

function declared(cipher = testCipher(), id = "sub_agence") {
  const minted = testMint(cipher).mint();
  const subscriber = VitrineSubscriber.declare({
    id,
    name: "Agence",
    endpointUrl: "https://agence.example/hook",
    contents: ["catalogue", "operations", "texts", "featured"],
    credentials: minted.stored,
    at: START,
  });
  return { subscriber, secret: minted.signingSecret };
}

describe("le balayage de la vitrine", () => {
  it("sans abonné livrable, ne lit RIEN de la boutique (S3)", async () => {
    const { sweep, shop } = world();
    expect(await sweep.execute()).toEqual({
      subscribers: 0,
      notified: 0,
      attempted: 0,
      delivered: 0,
    });
    expect(shop.catalogueReads).toBe(0);
  });

  it("lit la vue une fois par langue, quel que soit le nombre d'abonnés", async () => {
    const cipher = testCipher();
    const { sweep, shop } = world(
      declared(cipher, "a").subscriber,
      declared(cipher, "b").subscriber,
    );
    await sweep.execute();
    expect(shop.catalogueReads).toBe(3);
  });

  it("annonce tout au premier passage, signé, puis se tait tant que rien ne change", async () => {
    const cipher = testCipher();
    const { subscriber, secret } = declared(cipher);
    const { sweep, poster, clock } = world(subscriber);

    expect(await sweep.execute()).toMatchObject({ notified: 1, attempted: 1, delivered: 1 });
    const [sent] = poster.received;
    expect(sent?.url).toBe("https://agence.example/hook");
    expect(JSON.parse(sent?.body ?? "{}")).toMatchObject({
      subscriber: "sub_agence",
      sequence: 1,
      changed: { items: ["CRO-01", "PAI-01"], operations: ["galette"], shelves: ["viennoiseries"] },
    });
    expect(
      verifyVitrineSignature({
        secret,
        header: sent?.headers["vitrine-signature"],
        body: sent?.body ?? "",
        nowSeconds: clock.now().getTime() / 1000,
      }),
    ).toBe("ok");

    clock.advanceMs(FIVE_MINUTES);
    expect(await sweep.execute()).toMatchObject({ notified: 0, attempted: 0 });
  });

  it("un changement de prix part avec la séquence suivante, et seulement l'article", async () => {
    const { sweep, poster, shop, clock } = world(declared().subscriber);
    await sweep.execute();
    shop.view = catalogue({
      items: [item("CRO-01", { isFeatured: true, unitPriceMillicents: 1 }), item("PAI-01")],
    });
    clock.advanceMs(FIVE_MINUTES);
    await sweep.execute();
    expect(JSON.parse(poster.received[1]?.body ?? "{}")).toMatchObject({
      sequence: 2,
      changed: { items: ["CRO-01"], operations: [], shelves: [], texts: [] },
    });
  });

  it("agence en panne : UNE livraison en vol qui absorbe les suivantes, puis l'abonné en échec", async () => {
    const { sweep, poster, shop, clock, deliveries, store } = world(declared().subscriber);
    poster.outcome = { kind: "rejected", status: 503 };

    for (let round = 0; round < MAX_DELIVERY_ATTEMPTS; round += 1) {
      shop.view = catalogue({ items: [item("CRO-01", { unitPriceMillicents: 1_000 + round })] });
      await sweep.execute();
      expect(deliveries.all().filter((delivery) => delivery.isPending).length).toBeLessThanOrEqual(
        1,
      );
      clock.advanceMs(retryDelayMs(round + 1));
    }

    expect(deliveries.all()).toHaveLength(1);
    expect(deliveries.all()[0]?.isFailed).toBe(true);
    expect(poster.received).toHaveLength(MAX_DELIVERY_ATTEMPTS);
    expect((await store.load("sub_agence"))?.isDeliverable).toBe(false);

    shop.view = catalogue({ items: [item("NEW-01")] });
    expect(await sweep.execute()).toMatchObject({ subscribers: 0 });
    expect(poster.received).toHaveLength(MAX_DELIVERY_ATTEMPTS);
  });

  it("un secret illisible (clé de chiffrement changée) échoue en le disant, sans rien poster", async () => {
    const { subscriber } = declared(testCipher());
    const { sweep, poster, deliveries } = world(subscriber);
    // Un scellé d'une autre clé : l'empreinte de clé ne correspond pas.
    subscriber.rotate({ signingSecretSealed: "v1.autre.x.y.z", readKeyHash: "h" }, START);
    await sweep.execute();
    expect(poster.received).toHaveLength(0);
    expect(deliveries.all()[0]?.toPersistence().lastError).toContain("régénérer");
  });
});
