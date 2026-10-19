/**
 * E2E du **webhook de la vitrine** (doc `documentation/webhooks/vitrine.md`,
 * 2026-10-18) — vrai Postgres, vraie vue publique, vraie signature.
 *
 * Ce que seul ce niveau prouve :
 *
 * - le chemin entier : un abonné créé à l'écran → le balayage du cron compare
 *   la vue publique → une notification SIGNÉE arrive chez l'agence, et sa
 *   signature se vérifie avec le secret montré une fois ; un rejeu hors
 *   fenêtre se détecte ;
 * - une agence en panne : UNE livraison en vol, puis l'abonné « en échec »,
 *   plus rien ne part, et « tout renvoyer » resynchronise ;
 * - deux balayages qui se chevauchent ne livrent qu'une fois (le bail) ;
 * - le journal montre l'identifiant d'envoi que l'agence a reçu ;
 * - sur la route `/vitrine` ELLE-MÊME : jamais un prix pro, un article pro, un
 *   masqué au public, une mise en avant pro ; les cases décochées retirent.
 *
 * ⚠️ Ce qui n'est PAS éprouvé ici : le relais épinglé réel (`https`, refus des
 * adresses privées). L'agence de test écoute sur 127.0.0.1 en clair — que le
 * relais réel refuserait, à raison. Le port `WebhookPoster` est donc joué par
 * un relais de test qui poste au serveur local ; le refus des adresses est
 * éprouvé par les tests unitaires de `platform/outbound`.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type {
  VitrineCatalogueView,
  VitrineContent,
  VitrineCredentialsView,
  VitrineDeliveryView,
  VitrineSubscriberView,
  VitrineTextsView,
} from "@lfd/contracts";

import { verifyVitrineSignature } from "../src/b2b/vitrine/domain/services/vitrine-signature.js";
import {
  WebhookPoster,
  type WebhookPost,
  type WebhookPostOutcome,
} from "../src/platform/outbound/webhook-poster.js";
import { MAX_DELIVERY_ATTEMPTS, retryDelayMs } from "../src/platform/outbox/retry-policy.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { PUBLIC_LABEL, snapshotOf, type IngestedSku } from "./catalog-ingest-fixtures.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Ce que l'agence de test a reçu. */
interface Received {
  readonly body: string;
  readonly headers: IncomingHttpHeaders;
}

/** L'agence : un serveur local qui répond le statut qu'on lui donne. */
class AgencyServer {
  readonly received: Received[] = [];
  status = 204;
  /** Une agence lente : le temps de faire chevaucher deux balayages. */
  delayMs = 0;
  private server: Server | null = null;

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        this.received.push({
          body: Buffer.concat(chunks).toString("utf8"),
          headers: request.headers,
        });
        setTimeout(() => {
          response.statusCode = this.status;
          response.end();
        }, this.delayMs);
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
  }

  url(): string {
    const address = this.server?.address() as AddressInfo;
    return `http://127.0.0.1:${String(address.port)}/hook`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}

/**
 * Le relais de TEST : poste en clair au serveur local, quelle que soit
 * l'adresse https de l'abonné. Il remplace le relais épinglé, qui refuserait
 * 127.0.0.1 (cf. l'en-tête du fichier).
 */
class LocalPoster extends WebhookPoster {
  constructor(private readonly agency: AgencyServer) {
    super();
  }

  async post(request: WebhookPost): Promise<WebhookPostOutcome> {
    const response = await fetch(this.agency.url(), {
      method: "POST",
      body: request.body,
      headers: { ...request.headers, "content-type": "application/json" },
      redirect: "manual",
    });
    return response.ok
      ? { kind: "accepted", status: response.status }
      : { kind: "rejected", status: response.status };
  }
}

const agency = new AgencyServer();
const clock = new FixedClock(new Date(daysAgo(0)));
let ctx: E2eContext;

beforeAll(async () => {
  await agency.start();
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: WebhookPoster, value: new LocalPoster(agency) },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
  await agency.stop();
});

beforeEach(async () => {
  await ctx.reset();
  // Un catalogue vide au départ : la vitrine ne voit que ce que la suite sème.
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
  agency.received.splice(0);
  agency.status = 204;
  agency.delayMs = 0;
});

const ALL: readonly VitrineContent[] = ["catalogue", "operations", "texts", "featured"];
const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

function push(skus: readonly IngestedSku[]): Promise<void> {
  return deliverAsFacts(ctx, snapshotOf(skus));
}

async function subscribe(
  contents: readonly VitrineContent[] = ALL,
): Promise<VitrineCredentialsView> {
  return jsonBody<VitrineCredentialsView>(
    await staff()
      .post("/admin/vitrine/subscribers")
      .send({ name: "Agence du site", endpointUrl: "https://agence.e2e.test/hook", contents })
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

async function sweepReport(): Promise<{ readonly alreadyRunning: boolean }> {
  return jsonBody<{ readonly alreadyRunning: boolean }>(
    await ctx
      .http()
      .post("/admin/vitrine/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200),
  );
}

async function journal(id: string): Promise<readonly VitrineDeliveryView[]> {
  return jsonBody<readonly VitrineDeliveryView[]>(
    await staff().get(`/admin/vitrine/subscribers/${id}/deliveries`).expect(200),
  );
}

async function subscriberView(id: string): Promise<VitrineSubscriberView | undefined> {
  const all = jsonBody<readonly VitrineSubscriberView[]>(
    await staff().get("/admin/vitrine/subscribers").expect(200),
  );
  return all.find((subscriber) => subscriber.id === id);
}

async function readCatalogue(key: string, lang = "fr"): Promise<VitrineCatalogueView> {
  return jsonBody<VitrineCatalogueView>(
    await ctx.http().get(`/vitrine/catalogue?lang=${lang}`).set("x-vitrine-key", key).expect(200),
  );
}

const nowSeconds = (): number => Math.floor(clock.now().getTime() / 1000);

describe("de la création à la notification signée", () => {
  it("prévient l'agence au balayage, d'une notification qu'elle sait vérifier", async () => {
    await push([
      { sku: "VIE-001", priceMillicents: 140_000 },
      { sku: "VIE-002", priceMillicents: 160_000 },
    ]);
    const credentials = await subscribe();

    await sweep();

    expect(agency.received).toHaveLength(1);
    const [sent] = agency.received;
    const body = JSON.parse(sent?.body ?? "{}") as Record<string, unknown>;
    expect(body).toMatchObject({
      subscriber: credentials.id,
      sequence: 1,
      changed: { items: ["VIE-001", "VIE-002"] },
    });
    const header = sent?.headers["vitrine-signature"];
    const signature = typeof header === "string" ? header : undefined;
    expect(
      verifyVitrineSignature({
        secret: credentials.signingSecret,
        header: signature,
        body: sent?.body ?? "",
        nowSeconds: nowSeconds(),
      }),
    ).toBe("ok");
    // Le rejeu du même envoi, six minutes plus tard, se détecte.
    expect(
      verifyVitrineSignature({
        secret: credentials.signingSecret,
        header: signature,
        body: sent?.body ?? "",
        nowSeconds: nowSeconds() + 6 * 60,
      }),
    ).toBe("stale");
    const [delivered] = await journal(credentials.id);
    expect(delivered).toMatchObject({ state: "delivered", sequence: 1 });
    // L'identifiant d'envoi du journal est celui que l'agence a reçu.
    expect(delivered?.dispatchId).toBe(sent?.headers["vitrine-delivery"]);

    // Rien n'a changé : le balayage suivant se tait.
    await sweep();
    expect(agency.received).toHaveLength(1);
  });

  it("ne montre le secret et la clé qu'une fois — la liste ne les rend jamais", async () => {
    const credentials = await subscribe();
    const listed = JSON.stringify(
      jsonBody<unknown>(await staff().get("/admin/vitrine/subscribers").expect(200)),
    );
    expect(listed).not.toContain(credentials.signingSecret);
    expect(listed).not.toContain(credentials.readKey);
  });

  it("refuse une adresse qui porte un jeton en requête, en le disant", async () => {
    const refusal = await staff()
      .post("/admin/vitrine/subscribers")
      .send({ name: "A", endpointUrl: "https://agence.e2e.test/hook?token=x", contents: ALL })
      .expect(400);
    expect(jsonBody<{ code: string }>(refusal).code).toBe("vitrine.endpoint.carries_secret");
  });
});

describe("le bail du balayage", () => {
  /**
   * Régression (2026-10-19) : deux passages du cron qui se chevauchaient (un
   * balayage de plus de cinq minutes) postaient deux fois la même livraison.
   */
  it("deux balayages qui se chevauchent ne livrent qu'une fois : le second sort et le dit", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);
    await subscribe();
    agency.delayMs = 400;

    const reports = await Promise.all([sweepReport(), sweepReport()]);

    expect(agency.received).toHaveLength(1);
    expect(reports.map((report) => report.alreadyRunning).sort()).toEqual([false, true]);
    // Le bail est rendu : le passage suivant balaie.
    expect((await sweepReport()).alreadyRunning).toBe(false);
  });
});

describe("une agence en panne", () => {
  it("UNE livraison en vol, puis « en échec », puis « tout renvoyer » resynchronise", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);
    const { id } = await subscribe();
    agency.status = 503;

    await sweep();
    // Un changement pendant la panne : absorbé par la livraison qui attend.
    await push([
      { sku: "VIE-001", priceMillicents: 140_000 },
      { sku: "VIE-002", priceMillicents: 160_000 },
    ]);
    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      clock.advanceMs(retryDelayMs(attempt));
      await sweep();
    }

    const deliveries = await journal(id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ state: "failed", attempts: MAX_DELIVERY_ATTEMPTS });
    expect(deliveries[0]?.changed.items).toEqual(["VIE-001", "VIE-002"]);
    expect(agency.received).toHaveLength(MAX_DELIVERY_ATTEMPTS);
    expect((await subscriberView(id))?.state).toBe("failing");

    clock.advanceMs(retryDelayMs(MAX_DELIVERY_ATTEMPTS));
    await sweep();
    expect(agency.received).toHaveLength(MAX_DELIVERY_ATTEMPTS);

    agency.status = 204;
    await staff().post(`/admin/vitrine/subscribers/${id}/resync`).expect(204);
    await sweep();
    expect(agency.received).toHaveLength(MAX_DELIVERY_ATTEMPTS + 1);
    expect(JSON.parse(agency.received.at(-1)?.body ?? "{}")).toMatchObject({
      sequence: 2,
      changed: { items: ["VIE-001", "VIE-002"] },
    });
    expect((await subscriberView(id))?.state).toBe("active");
  });
});

describe("GET /vitrine — ce qui sort, sur la route elle-même", () => {
  async function aMixedCatalogue(): Promise<void> {
    await push([
      { sku: "PUB-001", priceMillicents: 140_000 },
      { sku: "PRO-001", priceMillicents: 150_000 },
      { sku: "HID-001", priceMillicents: 160_000 },
      { sku: "FEA-001", priceMillicents: 170_000 },
      { sku: "FPR-001", priceMillicents: 180_000 },
    ]);
    // L'audience `pro` est posée par le fait de la fiche ; ce semis la pose
    // directement, comme `shop-catalogue` pose ses décisions.
    await ctx.prisma.catalogItem.update({ where: { sku: "PRO-001-1" }, data: { audience: "pro" } });
    const decisions = [
      { sku: "PUB-001-1", priceMillicents: 120_000, decidedBy: "cecile" },
      { sku: "HID-001-1", isHiddenPublic: true },
      { sku: "FEA-001-1", isFeaturedPublic: true },
      { sku: "FPR-001-1", isFeaturedPro: true },
    ];
    for (const { sku, ...decision } of decisions) {
      await ctx.prisma.catalogItemOverride.upsert({
        where: { sku },
        create: { sku, ...decision },
        update: decision,
      });
    }
  }

  it("jamais un prix pro, un article pro, un masqué, une mise en avant pro — dans aucune langue", async () => {
    await aMixedCatalogue();
    const { readKey } = await subscribe();

    for (const lang of ["fr", "en", "it"]) {
      const view = await readCatalogue(readKey, lang);
      expect(view.language).toBe(lang);
      expect(view.items.map((item) => item.sku).sort()).toEqual(["FEA-001", "FPR-001", "PUB-001"]);
      expect(view.items.find((item) => item.sku === "FEA-001")?.isFeatured).toBe(true);
      expect(view.items.find((item) => item.sku === "FPR-001")?.isFeatured).toBe(false);
      expect(view.items.every((item) => item.audience !== "pro")).toBe(true);
      expect(view.items.find((item) => item.sku === "PUB-001")?.unitPriceMillicents).toBe(
        PUBLIC_LABEL.htMillicents,
      );
      const raw = JSON.stringify(view);
      expect(raw).not.toContain("120000");
      expect(raw).not.toContain("140000");
    }
    await ctx.http().get("/vitrine/articles/PRO-001").set("x-vitrine-key", readKey).expect(404);
    await ctx.http().get("/vitrine/articles/HID-001").set("x-vitrine-key", readKey).expect(404);
  });

  it("sans « incontournables », isFeatured ne sort pas", async () => {
    await aMixedCatalogue();
    const { readKey } = await subscribe(["catalogue"]);

    const view = await readCatalogue(readKey);
    expect(view.items.length).toBeGreaterThan(0);
    expect(view.items.every((item) => !("isFeatured" in item))).toBe(true);
  });

  it("une case décochée retire l'ensemble", async () => {
    await aMixedCatalogue();
    const { readKey } = await subscribe(["texts"]);

    expect(await readCatalogue(readKey)).toMatchObject({ items: [], shelves: [], operations: [] });
    const texts = jsonBody<VitrineTextsView>(
      await ctx.http().get("/vitrine/textes?lang=en").set("x-vitrine-key", readKey).expect(200),
    );
    expect(texts.texts["product.bestSeller"]).toBeTruthy();
    await ctx.http().get("/vitrine/articles/PUB-001").set("x-vitrine-key", readKey).expect(404);
  });

  it("un abonné coupé ne lit plus, comme une clé inconnue ; rallumé, il relit", async () => {
    const { id, readKey } = await subscribe();
    const unknown = await ctx
      .http()
      .get("/vitrine/catalogue")
      .set("x-vitrine-key", "vtrkey_INCONNUE");
    await staff()
      .put(`/admin/vitrine/subscribers/${id}/active`)
      .send({ active: false })
      .expect(204);
    const cut = await ctx.http().get("/vitrine/catalogue").set("x-vitrine-key", readKey);
    expect(cut.status).toBe(unknown.status);
    type Refusal = { readonly code: string; readonly message: string };
    const { code, message } = jsonBody<Refusal>(unknown);
    expect(jsonBody<Refusal>(cut)).toMatchObject({ code, message });
    await staff().put(`/admin/vitrine/subscribers/${id}/active`).send({ active: true }).expect(204);
    await readCatalogue(readKey);
  });

  it("refuse une clé absente ou remplacée par une rotation", async () => {
    const { id, readKey } = await subscribe();
    await ctx.http().get("/vitrine/catalogue").expect(403);
    await staff().post(`/admin/vitrine/subscribers/${id}/rotate`).expect(200);
    await ctx.http().get("/vitrine/catalogue").set("x-vitrine-key", readKey).expect(403);
  });
});

describe("le nom, la description et le contact d'un abonné", () => {
  const DESCRIPTION = "Le site public de la boutique, refait par l'agence.";
  const CONTACT = "web@agence.e2e.test";

  it("se saisissent à la création, se modifient, et se relisent à l'écran", async () => {
    const created = jsonBody<VitrineCredentialsView>(
      await staff()
        .post("/admin/vitrine/subscribers")
        .send({
          name: "Agence",
          endpointUrl: "https://agence.e2e.test/hook",
          contents: ALL,
          description: "Première version",
          contactEmail: "Equipe@Agence.E2e.Test",
        })
        .expect(201),
    );
    expect(await subscriberView(created.id)).toMatchObject({
      description: "Première version",
      contactEmail: "equipe@agence.e2e.test",
    });

    await staff()
      .put(`/admin/vitrine/subscribers/${created.id}/identity`)
      .send({ name: "Agence Lumière", description: DESCRIPTION, contactEmail: CONTACT })
      .expect(204);
    expect(await subscriberView(created.id)).toMatchObject({
      name: "Agence Lumière",
      description: DESCRIPTION,
      contactEmail: CONTACT,
    });

    await staff()
      .put(`/admin/vitrine/subscribers/${created.id}/identity`)
      .send({ name: "Agence Lumière", description: "", contactEmail: null })
      .expect(204);
    expect(await subscriberView(created.id)).toMatchObject({
      description: null,
      contactEmail: null,
    });
  });

  it("refuse un nom vide et un contact mal formé, sans rien changer", async () => {
    const { id } = await subscribe();
    const blank = await staff()
      .put(`/admin/vitrine/subscribers/${id}/identity`)
      .send({ name: "  ", description: DESCRIPTION, contactEmail: null })
      .expect(400);
    expect(jsonBody<{ code: string }>(blank).code).toBe("vitrine.subscriber.name_invalid");
    await staff()
      .put(`/admin/vitrine/subscribers/${id}/identity`)
      .send({ name: "Agence", description: null, contactEmail: "pas-une-adresse" })
      .expect(400);
    expect(await subscriberView(id)).toMatchObject({
      name: "Agence du site",
      description: null,
      contactEmail: null,
    });
  });

  it("ne sortent jamais vers l'agence : ni sur /vitrine, ni dans la notification", async () => {
    await push([{ sku: "VIE-001", priceMillicents: 140_000 }]);
    const { id, readKey } = await subscribe();
    await staff()
      .put(`/admin/vitrine/subscribers/${id}/identity`)
      .send({ name: "Agence", description: DESCRIPTION, contactEmail: CONTACT })
      .expect(204);

    await sweep();

    const served = [
      (await ctx.http().get("/vitrine/catalogue").set("x-vitrine-key", readKey).expect(200)).text,
      (await ctx.http().get("/vitrine/textes").set("x-vitrine-key", readKey).expect(200)).text,
      (await ctx.http().get("/vitrine/articles/VIE-001").set("x-vitrine-key", readKey)).text,
      ...agency.received.map((sent) => sent.body),
    ];
    expect(agency.received.length).toBeGreaterThan(0);
    for (const text of served) {
      expect(text).not.toContain(DESCRIPTION);
      expect(text).not.toContain(CONTACT);
    }
  });
});

describe("le droit `lfd_webhooks`", () => {
  it("ferme l'écran à qui ne l'a pas", async () => {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/staff-roles")
      .send({
        key: "sans-vitrine",
        label: "sans",
        grants: [{ resource: "b2b_storefront", action: "write" }],
      })
      .expect(201);
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "sans-vitrine",
        email: "sans-vitrine@lfc.test",
        role: null,
        roleKey: "sans-vitrine",
        status: "active",
        auth0Id: "staff-sans-vitrine",
      },
    });
    await ctx.asSub("staff-sans-vitrine").get("/admin/vitrine/subscribers").expect(403);
  });
});
