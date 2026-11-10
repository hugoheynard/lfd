import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import {
  MAX_DELIVERY_ATTEMPTS,
  retryDelayMs,
} from "../../../../../platform/outbox/retry-policy.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedWallClock } from "../../../../../platform/time/fixed-wall-clock.js";
import { verifyVitrineSignature } from "../../../domain/services/vitrine-signature.js";
import { catalogue, item } from "../../../domain/__tests__/vitrine-fixtures.js";
import { VitrineSubscriber } from "../../../domain/vitrine-subscriber.js";
import { VitrineRelay } from "../../services/vitrine-relay.js";
import { VitrineShowcaseLoader } from "../../services/vitrine-showcase.loader.js";
import { SweepVitrineHandler, VITRINE_SWEEP_LEASE_MS } from "../sweep-vitrine.handler.js";
import {
  MemoryDeliveries,
  MemoryPrints,
  MemorySubscribers,
  MemorySweepLease,
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
  const lease = new MemorySweepLease();
  const wall = new FixedWallClock(START);
  const sweep = new SweepVitrineHandler(
    store,
    deliveries,
    prints,
    new VitrineShowcaseLoader(shop),
    new VitrineRelay(poster, cipher, clock),
    new FixedIdGenerator("d"),
    clock,
    new DirectUnitOfWork(),
    lease,
    wall,
  );
  return { clock, cipher, store, deliveries, prints, shop, poster, sweep, lease, wall };
}

function declared(cipher = testCipher(), id = "sub_agence") {
  const minted = testMint(cipher).mint();
  const subscriber = VitrineSubscriber.declare({
    id,
    name: "Agence",
    description: null,
    contactEmail: null,
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
      alreadyRunning: false,
    });
    expect(shop.catalogueReads).toBe(0);
  });

  /** Décision Hugo du 2026-10-20 : un abonné en lecture seule n'a ni livraison, ni empreinte. */
  it("ne compare ni ne livre un abonné sans adresse ; son voisin pourvu reçoit", async () => {
    const cipher = testCipher();
    const reader = VitrineSubscriber.declare({
      id: "lecteur",
      name: "Agence Joomla",
      description: null,
      contactEmail: null,
      endpointUrl: null,
      contents: ["catalogue"],
      credentials: testMint(cipher).mint().stored,
      at: START,
    });
    const { sweep, deliveries, prints, poster } = world(
      reader,
      declared(cipher, "hook").subscriber,
    );
    const report = await sweep.execute();
    expect(report.subscribers).toBe(1);
    expect(deliveries.all().map((delivery) => delivery.subscriberId)).toEqual(["hook"]);
    expect(await prints.load("lecteur")).toHaveLength(0);
    expect(poster.received).toHaveLength(1);
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

  /**
   * Régression (2026-10-18) : l'absorption gardait l'identifiant d'envoi, et
   * l'agence qui écarte les doublons par `Vitrine-Delivery` perdait les ajouts.
   */
  it("une livraison qui absorbe de nouveaux changements repart sous un Vitrine-Delivery neuf", async () => {
    const { sweep, poster, shop, clock } = world(declared().subscriber);
    poster.outcome = { kind: "rejected", status: 504 };
    await sweep.execute();
    shop.view = catalogue({ items: [item("CRO-01"), item("PAI-01"), item("NEW-01")] });
    clock.advanceMs(retryDelayMs(1));
    await sweep.execute();

    const [first, second] = poster.received;
    const firstId = first?.headers["vitrine-delivery"];
    expect(firstId).toBeDefined();
    expect(second?.headers["vitrine-delivery"]).not.toBe(firstId);
    expect(JSON.parse(second?.body ?? "{}")).toMatchObject({ sequence: 1 });
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

describe("le bail du balayage", () => {
  /**
   * Régression (2026-10-19) : deux passages du cron qui se chevauchaient (un
   * balayage de plus de cinq minutes) postaient deux fois la même livraison.
   */
  it("deux balayages qui se chevauchent ne livrent qu'une fois : le second sort et le dit", async () => {
    const { sweep, poster, shop } = world(declared().subscriber);
    const reports = await Promise.all([sweep.execute(), sweep.execute()]);

    expect(poster.received).toHaveLength(1);
    expect(shop.catalogueReads).toBe(3);
    expect(reports).toContainEqual({
      subscribers: 0,
      notified: 0,
      attempted: 0,
      delivered: 0,
      alreadyRunning: true,
    });
    expect(reports).toContainEqual(
      expect.objectContaining({ delivered: 1, alreadyRunning: false }),
    );
  });

  it("rend le bail à la fin : le passage suivant balaie", async () => {
    const { sweep, lease } = world(declared().subscriber);
    await sweep.execute();
    expect(lease.held).toBeNull();
    expect(await sweep.execute()).toMatchObject({ alreadyRunning: false });
  });

  it("rend le bail même quand le balayage échoue", async () => {
    const { sweep, lease, shop } = world(declared().subscriber);
    shop.failing = true;
    await expect(sweep.execute()).rejects.toThrow();
    expect(lease.held).toBeNull();
    expect(lease.releases).toBe(1);
  });

  it("un bail échu (balayage tué en route) se reprend, mesuré au mur", async () => {
    const { sweep, lease, wall } = world(declared().subscriber);
    lease.held = { token: "mort", until: new Date(START.getTime() + VITRINE_SWEEP_LEASE_MS) };
    expect(await sweep.execute()).toMatchObject({ alreadyRunning: true });
    wall.advanceMs(VITRINE_SWEEP_LEASE_MS + 1);
    expect(await sweep.execute()).toMatchObject({ alreadyRunning: false, notified: 1 });
  });
});
