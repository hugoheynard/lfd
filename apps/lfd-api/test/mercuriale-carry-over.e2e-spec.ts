/**
 * E2E du **report d'une mercuriale sur la référence née d'un détachement**
 * (`documentation/pricing/plan-tarif-date-sur-une-reference.md`, § 6, T5).
 *
 * Ce que seul ce niveau prouve : la filiation lue au vrai catalogue du
 * commerce (descendue par le fait de la fiche), puis le prix négocié sur la
 * NOUVELLE référence à la caisse — pour le client et pour son sous-compte.
 *
 * Aucune date absolue : la mercuriale est posée autour de « maintenant »
 * (`daysAgo`), et le report part de maintenant.
 */
import type { CreatedIdResponse, SaleReferenceDecisionView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER } from "./catalog-facts-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const PART_PRO_PRICE_HT = "10";
const NEGOTIATED_MILLICENTS = 800_000;
const REASON = "Report de la déclinaison détachée";

const DELIVERY = {
  label: "Établissement",
  ligne1: "1 route du Lac",
  ligne2: "",
  codePostal: "74400",
  ville: "Chamonix",
  pays: "France",
  isDefault: true,
  specs: {
    signatureRequired: false,
    note: "",
    slotList: { mode: "everyday", slots: [] },
    deliveryContact: null,
    gps: null,
  },
};

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

async function approveAll(): Promise<void> {
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { withdrawnAt: null }, select: { sku: true } })
  ).map((row) => row.sku);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
}

/**
 * La scène : une fiche « Ancolie » et sa déclinaison « part », une
 * mercuriale qui négocie la part chez un client, puis la part détachée en
 * fiche à elle, publiée et reçue au commerce.
 */
async function detachedWithMercuriale(): Promise<{
  companyId: string;
  mercurialeId: string;
  oldSku: string;
  newSku: string;
}> {
  const fiche = await anActiveFiche(staff, "Ancolie", "both");
  const partId = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .send({ name: { fr: "Ancolie part" } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${partId}/pricing`)
    .send({ priceCents: 450, weightGrams: null, proPriceHt: PART_PRO_PRICE_HT })
    .expect(200);
  const detail = jsonBody<{ variants: { id: string; sku: string }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  const oldSku = detail.variants.find((variant) => variant.id === partId)?.sku ?? "";
  await relayAll(ctx);
  await approveAll();

  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await staff()
    .post(`/admin/pricing/companies/${company.id}/mercuriale`)
    .send({
      label: "Mercuriale Ancolie",
      validFrom: daysAgo(1),
      validTo: daysAgo(-30),
      lines: [{ sku: oldSku, unitPriceMillicents: NEGOTIATED_MILLICENTS }],
    })
    .expect(201);
  const mercuriale = await ctx.prisma.companyMercuriale.findFirstOrThrow({ select: { id: true } });

  const bornId = jsonBody<{ id: string }>(
    await staff().post(`${PRODUCTS}/${fiche.id}/variants/${partId}/detach`).expect(201),
  ).id;
  await staff().put(`${PRODUCTS}/${bornId}/publish`).send({}).expect(200);
  await relayAll(ctx);
  await approveAll();
  const born = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { productId: bornId, isDefault: true, withdrawnAt: null },
    select: { sku: true },
  });
  return { companyId: company.id, mercurialeId: mercuriale.id, oldSku, newSku: born.sku };
}

const carryOver = (oldSku: string, mercurialeId: string, toSku: string) =>
  staff()
    .post(
      `/admin/pricing/sale-references/${oldSku}/decisions/mercuriales/${mercurialeId}/carry-over`,
    )
    .send({ toSku, reason: REASON });

async function quotedPrice(sub: string, companyId: string, sku: string): Promise<number | null> {
  const quoted = jsonBody<{ lines: readonly { unitPriceMillicents: number }[] }>(
    await ctx
      .asSub(sub)
      .post("/orders/quote")
      .send({ companyId, lines: [{ sku, quantity: 1 }] })
      .expect(200),
  );
  return quoted.lines[0]?.unitPriceMillicents ?? null;
}

describe("le report d'une mercuriale sur la référence détachée (L7c)", () => {
  it("🔴 la nouvelle référence est facturée au prix négocié — au client et à son sous-compte", async () => {
    const { companyId, mercurialeId, oldSku, newSku } = await detachedWithMercuriale();
    const site = jsonBody<CreatedIdResponse>(
      await staff()
        .post(`/admin/companies/${companyId}/sub-accounts`)
        .send({ enseigne: "Site de Chamonix", deliveryAddress: DELIVERY, follows: [] })
        .expect(201),
    ).id;
    await staff().post(`/admin/companies/${site}/pricing-follow`).expect(204);
    const owner = await createUser(ctx.prisma, { auth0Sub: "auth0|report_client" });
    await attachTo(ctx.prisma, owner.id, companyId);
    const siteUser = await createUser(ctx.prisma, { auth0Sub: "auth0|report_site" });
    await attachTo(ctx.prisma, siteUser.id, site);
    expect(await quotedPrice("auth0|report_client", companyId, newSku)).not.toBe(
      NEGOTIATED_MILLICENTS,
    );

    await carryOver(oldSku, mercurialeId, newSku).expect(201);

    expect(await quotedPrice("auth0|report_client", companyId, newSku)).toBe(NEGOTIATED_MILLICENTS);
    expect(await quotedPrice("auth0|report_site", site, newSku)).toBe(NEGOTIATED_MILLICENTS);
    const amendment = await ctx.prisma.companyMercurialeAmendment.findFirstOrThrow({
      where: { mercurialeId },
      select: { origin: true, reason: true },
    });
    expect(amendment).toEqual({
      origin: { kind: "detached", fromSku: oldSku, fromMercurialeId: mercurialeId },
      reason: REASON,
    });
    const decisions = jsonBody<readonly SaleReferenceDecisionView[]>(
      await staff().get(`/admin/pricing/sale-references/${newSku}/decisions`).expect(200),
    );
    expect(decisions.map((decision) => decision.id)).toEqual([mercurialeId]);
  });

  it("refuse de reporter sur une référence qui n'est pas née de l'ancienne", async () => {
    const { mercurialeId, oldSku } = await detachedWithMercuriale();
    const stranger = await ctx.prisma.catalogItem.findFirstOrThrow({
      where: { detachedFromSku: null, withdrawnAt: null },
      select: { sku: true },
    });

    await carryOver(oldSku, mercurialeId, stranger.sku).expect(409);
  });

  it("refuse un second report : la nouvelle référence est déjà négociée", async () => {
    const { mercurialeId, oldSku, newSku } = await detachedWithMercuriale();
    await carryOver(oldSku, mercurialeId, newSku).expect(201);

    await carryOver(oldSku, mercurialeId, newSku).expect(409);
  });
});
