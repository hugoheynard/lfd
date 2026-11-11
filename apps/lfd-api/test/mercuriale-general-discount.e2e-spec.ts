/**
 * E2E de **la remise générale d'une mercuriale**
 * (`documentation/pricing/mercuriales/plan-remise-generale.md`, R2) : « −30 %
 * sur tout, −40 % sur les pains, sauf le pain au chocolat », à côté d'un prix
 * ferme qui passe devant. Posée par la route du dossier, persistée, relue par
 * la fiche staff, appliquée au rayon et au devis du client ; changée par un
 * avenant daté ; refusée chez un client sous engagement de volume (Q2) ;
 * tenue en base par ses CHECK ; murée par société.
 *
 * Les dates sont relatives à maintenant (`daysAgo`) : aucune n'est écrite en dur.
 */
import { CustomerRole } from "../src/platform/database/client/client.js";
import type {
  CompanyPricingView,
  GeneralDiscountPayload,
  MyShopQuoteView,
  ShopCatalogueView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { E2E_FAMILIES } from "./catalog-fixture.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

const MEMBER = "auth0|membre-remise";
const NEIGHBOUR = "auth0|membre-voisin";

/** Croissant, 2,00 € pro : couvert par le taux de base, −30 %. */
const COVERED = "VIE-001-1";
/** Baguette tradition, 2,00 € pro : famille Pains, −40 %. */
const FAMILY_RATED = "PAI-001-1";
/** Pain au chocolat, 2,20 € pro : exclu de la remise. */
const EXCLUDED = "VIE-002-1";
/** Patte d'ours, 3,00 € pro : prix ferme à 1,00 €, qui passe devant (D2). */
const FIRM = "VIE-003-1";

const DISCOUNT: GeneralDiscountPayload = {
  mode: "all_except",
  baseBp: 3_000,
  rules: [
    { target: "category", targetId: E2E_FAMILIES.PAI.id, bp: 4_000 },
    { target: "variant", targetId: EXCLUDED, bp: null },
  ],
};

let companyId = "";
let neighbourId = "";
let pickupId = "";

const staff = () => ctx.asSub("staff-e2e");

beforeEach(async () => {
  await ctx.reset();
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma);
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.orders);
  companyId = company.id;
  const neighbour = await createUser(ctx.prisma, { auth0Sub: NEIGHBOUR });
  const other = await createCompany(ctx.prisma);
  await attachTo(ctx.prisma, neighbour.id, other.id, CustomerRole.orders);
  neighbourId = other.id;
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

function pose(body: Record<string, unknown>, company = companyId) {
  return staff()
    .post(`/admin/pricing/companies/${company}/mercuriale`)
    .send({ label: "Remise 2026", validFrom: daysAgo(30), validTo: null, lines: [], ...body });
}

async function posedId(): Promise<string> {
  const row = await ctx.prisma.companyMercuriale.findFirstOrThrow({
    where: { companyId },
    select: { id: true },
  });
  return row.id;
}

async function shelfPrices(sub = MEMBER): Promise<Map<string, number>> {
  const view = jsonBody<ShopCatalogueView>(
    await ctx.asSub(sub).get("/shop/catalogue/mine").expect(200),
  );
  return new Map(view.items.map((item) => [item.sku, item.unitPriceMillicents]));
}

async function dossier(): Promise<CompanyPricingView> {
  return jsonBody<CompanyPricingView>(
    await staff().get(`/admin/pricing/companies/${companyId}`).expect(200),
  );
}

describe("poser une mercuriale à remise générale", () => {
  it("à remise seule, sans prix ferme (D5), et la fiche staff la relit", async () => {
    await pose({ generalDiscount: DISCOUNT }).expect(201);

    const view = await dossier();
    expect(view.mercuriales[0]).toMatchObject({
      skuCount: 0,
      generalDiscount: DISCOUNT,
      initialGeneralDiscount: DISCOUNT,
    });
    // Les articles que la remise fait ne comptent pas parmi les prix fermes (§ 4).
    expect(view.negotiatedSkuCount).toBe(0);
    expect(view.averageGapBp).toBeNull();
    expect(view.generalDiscountSkuCount).toBeGreaterThan(0);
  });

  it("refuse une mercuriale qui ne porte ni prix ferme ni remise (400)", async () => {
    await pose({}).expect(400);
  });

  it("refuse une forme hors contrat (taux à 100 %, cible « produit ») avant le domaine (400)", async () => {
    await pose({ generalDiscount: { ...DISCOUNT, baseBp: 10_000 } }).expect(400);
    await pose({
      generalDiscount: {
        ...DISCOUNT,
        rules: [{ target: "product", targetId: "VIE-001", bp: 100 }],
      },
    }).expect(400);
  });

  it("le journal de la pose dit la remise", async () => {
    await pose({ generalDiscount: DISCOUNT }).expect(201);

    const act = await ctx.prisma.pricingEvent.findFirstOrThrow({
      where: { subjectType: "mercuriale", act: "posed" },
      select: { summary: true },
    });
    expect(act.summary).toContain("remise générale −30 %, 1 taux particulier, sauf 1 article");
  });
});

describe("le prix du client", () => {
  beforeEach(async () => {
    await pose({
      generalDiscount: DISCOUNT,
      lines: [{ sku: FIRM, unitPriceMillicents: 100_000 }],
    }).expect(201);
  });

  it("au rayon : base −30 %, famille −40 %, l'exclu au tarif, le prix ferme devant", async () => {
    const prices = await shelfPrices();

    expect(prices.get(COVERED)).toBe(140_000);
    expect(prices.get(FAMILY_RATED)).toBe(120_000);
    expect(prices.get(EXCLUDED)).toBe(220_000);
    expect(prices.get(FIRM)).toBe(100_000);
  });

  it("au devis : la caisse dit la même chose que le rayon", async () => {
    const quote = jsonBody<MyShopQuoteView>(
      await ctx
        .asSub(MEMBER)
        .post("/shop/quote/mine")
        .send({
          lines: [
            { sku: COVERED, quantity: 1 },
            { sku: FAMILY_RATED, quantity: 1 },
            { sku: EXCLUDED, quantity: 1 },
            { sku: FIRM, quantity: 1 },
          ],
          fulfillment: { method: "pickup", pickupAddressId: pickupId },
        })
        .expect(200),
    );
    // 1,40 + 1,20 + 2,20 + 1,00 = 5,80 € HT.
    expect(quote.subtotalHtCents).toBe(580);
  });

  it("dans la fiche staff : prix fermes et articles remisés comptés à part", async () => {
    const view = await dossier();

    expect(view.negotiatedSkuCount).toBe(1);
    expect(view.generalDiscountSkuCount).toBeGreaterThanOrEqual(2);
  });

  it("🔴 le mur : le client d'une autre société paie le tarif", async () => {
    const prices = await shelfPrices(NEIGHBOUR);

    expect(prices.get(COVERED)).toBe(200_000);
    expect(prices.get(FAMILY_RATED)).toBe(200_000);
  });

  it("🔴 le mur : un avenant par le dossier d'une autre société ne trouve pas la mercuriale (404)", async () => {
    const id = await posedId();

    await staff()
      .post(`/admin/pricing/companies/${neighbourId}/mercuriale/${id}/amendments`)
      .send({ reason: "Essai", generalDiscount: { set: null } })
      .expect(404);
  });
});

describe("l'avenant daté", () => {
  const amend = (body: Record<string, unknown>, id: string) =>
    staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale/${id}/amendments`)
      .send({ reason: "Geste commercial", lines: [], endedSkus: [], ...body });

  it("change le taux sur sa fenêtre seulement : pas avant son début, à partir de lui", async () => {
    await pose({ generalDiscount: DISCOUNT }).expect(201);
    const id = await posedId();
    const twenty = { ...DISCOUNT, baseBp: 2_000 };

    await amend(
      { validFrom: daysAgo(-5), validTo: daysAgo(-10), generalDiscount: { set: twenty } },
      id,
    ).expect(201);
    expect((await shelfPrices()).get(COVERED)).toBe(140_000);

    await amend({ validTo: daysAgo(-10), generalDiscount: { set: twenty } }, id).expect(201);
    expect((await shelfPrices()).get(COVERED)).toBe(160_000);
    expect((await dossier()).mercuriales[0]?.generalDiscount).toEqual(twenty);
  });

  it("`{ set: null }` arrête la remise : l'article couvert revient au tarif", async () => {
    await pose({ generalDiscount: DISCOUNT }).expect(201);

    await amend({ generalDiscount: { set: null } }, await posedId()).expect(201);

    expect((await shelfPrices()).get(COVERED)).toBe(200_000);
    const stored = await ctx.prisma.companyMercurialeAmendment.findFirstOrThrow({
      select: { generalDiscountSet: true, generalDiscount: true },
    });
    expect(stored).toEqual({ generalDiscountSet: true, generalDiscount: null });
  });
});

describe("Q2 — pas de remise générale sous engagement de volume", () => {
  beforeEach(async () => {
    await staff()
      .post("/admin/pricing/commitments")
      .send({
        companyId,
        scope: { type: "product", id: COVERED },
        promisedQuantity: 1_000,
        validFrom: daysAgo(10),
        validTo: daysAgo(-60),
      })
      .expect(201);
  });

  it("refuse la pose (409), en nommant le geste de sortie", async () => {
    const refused = await pose({ generalDiscount: DISCOUNT }).expect(409);

    expect(JSON.stringify(refused.body)).toContain("Clôturez d'abord l'engagement");
    expect(await ctx.prisma.companyMercuriale.count({ where: { companyId } })).toBe(0);
  });

  it("refuse un avenant qui pose une remise sur une mercuriale qui n'en avait pas (409)", async () => {
    await pose({ lines: [{ sku: FIRM, unitPriceMillicents: 100_000 }] }).expect(201);

    await staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale/${await posedId()}/amendments`)
      .send({ reason: "Remise", generalDiscount: { set: DISCOUNT } })
      .expect(409);
  });
});

describe("la base tient la forme", () => {
  it("🔴 refuse une remise mal formée écrite à la main (CHECK de forme)", async () => {
    await pose({ generalDiscount: DISCOUNT }).expect(201);
    const id = await posedId();

    await expect(
      ctx.prisma.$executeRaw`UPDATE public.company_mercuriales
        SET general_discount = '{"mode":"tout","baseBp":3000,"rules":[]}'::jsonb WHERE id = ${id}`,
    ).rejects.toThrow(/company_mercuriales_general_discount_shape/);
    await expect(
      ctx.prisma.$executeRaw`UPDATE public.company_mercuriales
        SET general_discount = '{"mode":"all_except","baseBp":12.5,"rules":[]}'::jsonb WHERE id = ${id}`,
    ).rejects.toThrow(/company_mercuriales_general_discount_shape/);
    await expect(
      ctx.prisma.$executeRaw`UPDATE public.mercuriale_drafts
        SET general_discount = '{"mode":"only","baseBp":null,"rules":{}}'::jsonb`,
    ).resolves.toBe(0);
  });

  it("🔴 refuse une remise sur un avenant qui dit « rien » (CHECK du drapeau)", async () => {
    await pose({ generalDiscount: DISCOUNT }).expect(201);
    await staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale/${await posedId()}/amendments`)
      .send({ reason: "Fin de remise", generalDiscount: { set: null } })
      .expect(201);

    await expect(
      ctx.prisma.$executeRaw`UPDATE public.company_mercuriale_amendments
        SET general_discount_set = false,
            general_discount = '{"mode":"all_except","baseBp":3000,"rules":[]}'::jsonb`,
    ).rejects.toThrow(/company_mercuriale_amendments_general_discount_set/);
  });
});

describe("le brouillon garde la remise saisie", () => {
  it("enregistre et relit la remise envisagée", async () => {
    await staff()
      .put(`/admin/pricing/companies/${companyId}/mercuriale/draft`)
      .send({
        label: "En cours",
        validFrom: null,
        validTo: null,
        lines: [],
        generalDiscount: DISCOUNT,
      })
      .expect(204);

    const read = jsonBody<{ draft: { generalDiscount?: GeneralDiscountPayload | null } | null }>(
      await staff().get(`/admin/pricing/companies/${companyId}/mercuriale/draft`).expect(200),
    );
    expect(read.draft?.generalDiscount).toEqual(DISCOUNT);
  });
});
