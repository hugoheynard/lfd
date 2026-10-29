/**
 * E2E — **pourquoi une déclinaison n'est pas proposée aux pros, et la
 * filiation du détachement au commerce**
 * (`documentation/catalogue/plan-pro-voit-les-declinaisons.md`, L6 et L7).
 *
 * Ce que seul ce niveau prouve : qu'une déclinaison sans prix pro arrive à
 * la vue « Catalogue publié » sous la forme que le back-office lit pour dire
 * « pas de prix pro » (L6) ; qu'une mercuriale posée sur une déclinaison
 * reste listée sur son ancienne référence après le détachement, sans que rien
 * ne la déplace ; et que la fiche née du détachement, une fois active, porte
 * cette ancienne référence sur son article au commerce (L7 a, b).
 */
import type { PublishedCatalogView, SaleReferenceDecisionView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const PART_PRO_PRICE_HT = "10";
const PART_MERCURIALE_MILLICENTS = 800_000;
const DAY_MS = 86_400_000;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une fiche « Ancolie » active, et une seconde déclinaison au prix pro donné (ou sans). */
async function ancolieWithPart(
  proPriceHt: string | null,
): Promise<{ fiche: Fiche; partId: string; partSku: string }> {
  const fiche = await anActiveFiche(staff, "Ancolie", "both");
  const partId = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .send({ name: { fr: "Ancolie part" } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${partId}/pricing`)
    .send({ priceCents: 450, weightGrams: null, proPriceHt })
    .expect(200);
  const detail = jsonBody<{ variants: { id: string; sku: string }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  await relayAll(ctx);
  const partSku = detail.variants.find((variant) => variant.id === partId)?.sku ?? "";
  return { fiche, partId, partSku };
}

async function approveAll(): Promise<void> {
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { withdrawnAt: null }, select: { sku: true } })
  ).map((row) => row.sku);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
}

async function decisionsOn(sku: string): Promise<readonly SaleReferenceDecisionView[]> {
  return jsonBody<SaleReferenceDecisionView[]>(
    await staff().get(`/admin/pricing/sale-references/${sku}/decisions`).expect(200),
  );
}

describe("L6 — la cause d'une déclinaison absente du canal pro", () => {
  it("une déclinaison sans prix pro est « incomplète » pour les pros, sans manque ni prix", async () => {
    const { fiche, partSku } = await ancolieWithPart(null);
    await approveAll();

    const view = jsonBody<PublishedCatalogView>(
      await staff().get("/admin/catalog/published").expect(200),
    );
    const part = view.entries
      .find((entry) => entry.productId === fiche.id)
      ?.variants.find((variant) => variant.sku === partSku);

    // Le back-office lit cette forme comme « pas de prix pro » (`proOfferCauseOf`).
    expect(part).toMatchObject({
      onSale: true,
      gaps: [],
      pro: { state: "incomplet", htMillicents: null },
      public: { state: "en_vente" },
    });
  });
});

describe("L7 — la filiation du détachement au commerce", () => {
  it("la mercuriale de la déclinaison reste listée sur l'ancienne référence, intacte", async () => {
    const { fiche, partId, partSku } = await ancolieWithPart(PART_PRO_PRICE_HT);
    await approveAll();
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    const now = Date.now();
    await staff()
      .post(`/admin/pricing/companies/${company.id}/mercuriale`)
      .send({
        label: "Mercuriale Ancolie",
        validFrom: new Date(now - DAY_MS).toISOString(),
        validTo: new Date(now + 30 * DAY_MS).toISOString(),
        lines: [{ sku: partSku, unitPriceMillicents: PART_MERCURIALE_MILLICENTS }],
      })
      .expect(201);
    const before = await ctx.prisma.companyMercuriale.findMany();

    const bornId = jsonBody<{ id: string }>(
      await staff().post(`${PRODUCTS}/${fiche.id}/variants/${partId}/detach`).expect(201),
    ).id;
    await relayAll(ctx);

    expect(await decisionsOn(partSku)).toEqual([
      expect.objectContaining({
        kind: "mercuriale",
        label: "Mercuriale Ancolie",
        companyId: company.id,
        paused: false,
      }),
    ]);
    // Rien n'a été déplacé ni réécrit : le détachement ne touche pas au tarif.
    expect(await ctx.prisma.companyMercuriale.findMany()).toEqual(before);

    await staff().put(`${PRODUCTS}/${bornId}/publish`).send({}).expect(200);
    await relayAll(ctx);
    const born = await ctx.prisma.catalogItem.findMany({
      where: { productId: bornId },
      select: { detachedFromSku: true },
    });
    expect(born.length).toBeGreaterThan(0);
    expect(born.every((item) => item.detachedFromSku === partSku)).toBe(true);
  });

  it("une mercuriale close ne se liste plus", async () => {
    const { partSku } = await ancolieWithPart(PART_PRO_PRICE_HT);
    await approveAll();
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    const now = Date.now();
    await staff()
      .post(`/admin/pricing/companies/${company.id}/mercuriale`)
      .send({
        label: "Mercuriale close",
        validFrom: new Date(now - DAY_MS).toISOString(),
        validTo: new Date(now + 30 * DAY_MS).toISOString(),
        lines: [{ sku: partSku, unitPriceMillicents: PART_MERCURIALE_MILLICENTS }],
      })
      .expect(201);
    const posed = await ctx.prisma.companyMercuriale.findFirstOrThrow({ select: { id: true } });
    await staff()
      .post(`/admin/pricing/companies/${company.id}/mercuriale/close`)
      .send({ id: posed.id })
      .expect(200);

    expect(await decisionsOn(partSku)).toEqual([]);
  });
});
