/**
 * E2E du **XML de la vitrine** (Hugo, 2026-10-18 — plan
 * `documentation/webhooks/plan-webhook-vitrine.md` §5 point 4) : les trois lectures
 * servent la MÊME ressource en XML, et `GET /vitrine/schema.xsd` la décrit.
 *
 * Ce que seul ce niveau prouve : la négociation réelle (en-tête, paramètre,
 * refus), le `Content-Type` servi, et que les VRAIES vues — sorties du vrai
 * catalogue — passent par le sérialiseur sans champ que le schéma ignore. Le
 * sérialiseur refuse un champ non déclaré (500) : une lecture verte ici est
 * une sortie dont chaque élément est au XSD. Chaque nom d'élément rendu est en
 * plus cherché dans le XSD servi.
 */
import type {
  VitrineCatalogueView,
  VitrineCredentialsView,
  VitrineTextsView,
} from "@lfd/contracts";
import type { Response, Test } from "supertest";

import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
});

async function aSubscriberWithACatalogue(): Promise<string> {
  await deliverAsFacts(
    ctx,
    snapshotOf([
      { sku: "VIE-001", priceMillicents: 140_000 },
      { sku: "VIE-002", priceMillicents: 160_000 },
    ]),
  );
  const credentials = jsonBody<VitrineCredentialsView>(
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/vitrine/subscribers")
      .send({
        name: "Agence du site",
        endpointUrl: "https://agence.e2e.test/hook",
        contents: ["catalogue", "operations", "texts", "featured"],
      })
      .expect(201),
  );
  return credentials.readKey;
}

/** Le corps brut : superagent ne garde pas en texte un `application/xml`. */
function read(path: string, key: string, accept?: string): Test {
  const request = ctx
    .http()
    .get(path)
    .set("x-vitrine-key", key)
    .buffer(true)
    .parse((response, done) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => (text += chunk));
      response.on("end", () => done(null, text));
    });
  return accept === undefined ? request : request.set("accept", accept);
}

const bodyText = (response: Response): string => String(response.body);

function elementNames(xml: string): readonly string[] {
  return [...new Set([...xml.matchAll(/<([A-Za-z][A-Za-z0-9]*)[\s>/]/g)].map((m) => m[1] ?? ""))];
}

async function expectDeclaredBySchema(xml: string): Promise<void> {
  const schema = bodyText(await read("/vitrine/schema.xsd", "").expect(200));
  for (const name of elementNames(xml)) {
    expect(schema).toContain(`name="${name}"`);
  }
}

describe("la vitrine en XML", () => {
  it("sert le catalogue en XML sur Accept: application/xml, et c'est la même ressource", async () => {
    const key = await aSubscriberWithACatalogue();
    const json = jsonBody<VitrineCatalogueView>(
      await ctx.http().get("/vitrine/catalogue").set("x-vitrine-key", key).expect(200),
    );

    const response = await read("/vitrine/catalogue", key, "application/xml").expect(200);
    expect(response.headers["content-type"]).toBe("application/xml; charset=utf-8");
    expect(response.headers["vary"]).toContain("Accept");
    const xml = bodyText(response);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<catalogue>')).toBe(true);
    for (const item of json.items) {
      expect(xml).toContain(`<sku>${item.sku}</sku>`);
      expect(xml).toContain(`<unitPriceMillicents>${String(item.unitPriceMillicents)}`);
    }
    expect(xml.match(/<item>/g)).toHaveLength(json.items.length);
    await expectDeclaredBySchema(xml);
  });

  it("sert un article et les textes par ?format=xml", async () => {
    const key = await aSubscriberWithACatalogue();

    const item = bodyText(await read("/vitrine/articles/VIE-001?format=xml", key).expect(200));
    expect(item).toContain("<item>\n  <sku>VIE-001</sku>");
    await expectDeclaredBySchema(item);

    const json = jsonBody<VitrineTextsView>(
      await ctx.http().get("/vitrine/textes?lang=en").set("x-vitrine-key", key).expect(200),
    );
    const texts = bodyText(await read("/vitrine/textes?lang=en&format=xml", key).expect(200));
    expect(texts).toContain("<texts>\n  <language>en</language>\n  <texts>");
    expect(texts.match(/<text key="/g)).toHaveLength(Object.keys(json.texts).length);
    expect(texts).toContain('<text key="product.bestSeller">');
    await expectDeclaredBySchema(texts);
  });

  it("?format=json l'emporte sur l'en-tête, et reste le défaut", async () => {
    const key = await aSubscriberWithACatalogue();
    const response = await ctx
      .http()
      .get("/vitrine/catalogue?format=json")
      .set("x-vitrine-key", key)
      .set("accept", "application/xml")
      .expect(200);
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("refuse un format inconnu en le disant, avec son code", async () => {
    const key = await aSubscriberWithACatalogue();
    const refusal = await ctx
      .http()
      .get("/vitrine/catalogue?format=csv")
      .set("x-vitrine-key", key)
      .expect(400);
    const body = jsonBody<{ code: string; message: string }>(refusal);
    expect(body.code).toBe("http.payload.invalid");
    expect(body.message).toContain("json, xml");
  });

  it("refuse la clé en JSON même quand le XML est demandé : l'erreur reste une erreur", async () => {
    const refusal = await ctx
      .http()
      .get("/vitrine/catalogue?format=xml")
      .set("x-vitrine-key", "inconnue")
      .expect(403);
    expect(jsonBody<{ code: string }>(refusal).code).toBe("vitrine.read_key.refused");
  });

  it("sert le XSD sans clé, en XML", async () => {
    const response = await ctx.http().get("/vitrine/schema.xsd").expect(200);
    expect(response.headers["content-type"]).toBe("application/xml; charset=utf-8");
    const schema = bodyText(await read("/vitrine/schema.xsd", ""));
    expect(schema).toContain('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"');
    expect(schema).toContain('<xs:element name="catalogue">');
  });
});
