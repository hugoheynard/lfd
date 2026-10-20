/**
 * E2E de l'**abonné vitrine en lecture seule** (décision Hugo du 2026-10-20 —
 * `documentation/webhooks/vitrine.md`) : un abonné SANS adresse de webhook,
 * qui lit le flux avec sa clé et ne veut aucun POST (l'agence du site Joomla).
 *
 * Ce que seul ce niveau prouve : la colonne nullable acceptée par la vraie
 * base (contrainte `https` comprise), la lecture XML servie à sa clé, et que
 * le vrai balayage n'écrit AUCUNE livraison pour lui — quand son voisin
 * pourvu d'une adresse en reçoit.
 *
 * Le port `WebhookPoster` est joué par un relais qui enregistre sans poster :
 * ce qui part n'est pas le sujet, seulement à QUI on écrit.
 */
import type { VitrineCredentialsView, VitrineSubscriberView } from "@lfd/contracts";

import {
  WebhookPoster,
  type WebhookPost,
  type WebhookPostOutcome,
} from "../src/platform/outbound/webhook-poster.js";
import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Le relais de test : il accepte tout et retient ce qu'on lui a demandé. */
class RecordingPoster extends WebhookPoster {
  readonly posted: WebhookPost[] = [];

  post(request: WebhookPost): Promise<WebhookPostOutcome> {
    this.posted.push(request);
    return Promise.resolve({ kind: "accepted", status: 204 });
  }
}

const poster = new RecordingPoster();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: WebhookPoster, value: poster }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
  poster.posted.splice(0);
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);
const HOOK = "https://agence.e2e.test/hook";

async function subscribe(name: string, endpointUrl?: string): Promise<VitrineCredentialsView> {
  return jsonBody<VitrineCredentialsView>(
    await staff()
      .post("/admin/vitrine/subscribers")
      .send({
        name,
        contents: ["catalogue"],
        ...(endpointUrl === undefined ? {} : { endpointUrl }),
      })
      .expect(201),
  );
}

async function sweep(): Promise<void> {
  await ctx
    .http()
    .post("/admin/vitrine/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
}

function deliveriesOf(subscriberId: string): Promise<number> {
  return ctx.prisma.vitrineDelivery.count({ where: { subscriberId } });
}

describe("un abonné vitrine en lecture seule", () => {
  it("se crée sans adresse, et la liste le dit par une adresse nulle", async () => {
    const { id } = await subscribe("Agence Joomla");
    const listed = jsonBody<readonly VitrineSubscriberView[]>(
      await staff().get("/admin/vitrine/subscribers").expect(200),
    );
    expect(listed.find((subscriber) => subscriber.id === id)).toMatchObject({
      endpointUrl: null,
      state: "active",
    });
  });

  it("lit le catalogue en XML avec sa clé ; coupé, il ne lit plus", async () => {
    await deliverAsFacts(ctx, snapshotOf([{ sku: "VIE-001", priceMillicents: 140_000 }]));
    const { id, readKey } = await subscribe("Agence Joomla", "");
    const xml = await ctx
      .http()
      .get("/vitrine/catalogue")
      .set("x-vitrine-key", readKey)
      .set("accept", "application/xml")
      .buffer(true)
      .parse((response, done) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (text += chunk));
        response.on("end", () => done(null, text));
      })
      .expect(200);
    expect(String(xml.body)).toContain("<sku>VIE-001</sku>");

    await staff()
      .put(`/admin/vitrine/subscribers/${id}/active`)
      .send({ active: false })
      .expect(204);
    await ctx.http().get("/vitrine/catalogue").set("x-vitrine-key", readKey).expect(403);
  });

  /** Décision Hugo du 2026-10-20 : il lit le flux, rien ne lui est envoyé. */
  it("un changement de catalogue ne lui crée aucune livraison, et en crée pour l'abonné pourvu", async () => {
    const reader = await subscribe("Agence Joomla");
    const hooked = await subscribe("Agence du site", HOOK);

    await deliverAsFacts(ctx, snapshotOf([{ sku: "VIE-001", priceMillicents: 140_000 }]));
    await sweep();
    await deliverAsFacts(
      ctx,
      snapshotOf([
        { sku: "VIE-001", priceMillicents: 150_000 },
        { sku: "VIE-002", priceMillicents: 160_000 },
      ]),
    );
    await sweep();

    expect(await deliveriesOf(reader.id)).toBe(0);
    expect(await ctx.prisma.vitrineFingerprint.count({ where: { subscriberId: reader.id } })).toBe(
      0,
    );
    expect(await deliveriesOf(hooked.id)).toBeGreaterThan(0);
    expect(poster.posted.every((sent) => sent.url === HOOK)).toBe(true);
    expect(poster.posted.length).toBeGreaterThan(0);
  });

  it("refuse l'essai en nommant le cas, sans rien poster", async () => {
    const { id } = await subscribe("Agence Joomla");
    const refused = await staff().post(`/admin/vitrine/subscribers/${id}/test`).expect(409);
    expect(jsonBody<{ readonly message: string }>(refused).message).toBe(
      "Cet abonné n'a pas d'adresse de webhook : il lit le flux, rien ne lui est envoyé.",
    );
    expect(poster.posted).toHaveLength(0);
    expect(await deliveriesOf(id)).toBe(0);
  });
});
