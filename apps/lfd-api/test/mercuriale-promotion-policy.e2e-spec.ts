import { randomUUID } from "node:crypto";

/**
 * E2E de **la mercuriale qui décide** (`documentation/promotions/plan-la-mercuriale-decide.md`,
 * § 8) : un client négocié reçoit, sur les articles que sa mercuriale fixe,
 * aucune promotion, toutes, ou celles qu'elle a choisies — au rayon comme au
 * panier ; la politique change par un avenant daté, et une commande passée
 * garde ses prix.
 *
 * Les dates sont relatives à maintenant (`daysAgo`) : aucune n'est écrite en dur.
 */
import { CustomerRole } from "../src/platform/database/client/client.js";
import type {
  MercurialePromotionPolicyPayload,
  MercurialesAcceptingPromotionView,
  MyShopQuoteView,
  ShopCatalogueView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, daysAgo, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { onlyVariant, posePromotion, promotionTerms } from "./promotion-fixtures.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};
let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({ id: `pi_mp_${String(intentCounter)}`, clientSecret: "secret" });
  },
  publishableKey: () => "pk_test",
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

const MEMBER = "auth0|membre-mercuriale";
/** VIE-001-1 vaut 2,00 € pro ; la mercuriale le fixe à 1,50 €. */
const NEGOTIATED = "VIE-001-1";
const NEGOTIATED_MILLICENTS = 150_000;
/** VIE-002-1, 2,20 € pro, que la mercuriale ne fixe pas. */
const FREE = "VIE-002-1";
const FREE_MILLICENTS = 220_000;

let companyId = "";
let mercurialeId = "";
let pickupId = "";

const staff = () => ctx.asSub("staff-e2e");

beforeEach(async () => {
  await ctx.reset();
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma);
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.orders);
  companyId = company.id;
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

async function poseMercuriale(promotionPolicy?: MercurialePromotionPolicyPayload): Promise<void> {
  await staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Mercuriale négociée",
      validFrom: daysAgo(30),
      validTo: daysAgo(-300),
      lines: [{ sku: NEGOTIATED, unitPriceMillicents: NEGOTIATED_MILLICENTS }],
      ...(promotionPolicy === undefined ? {} : { promotionPolicy }),
    })
    .expect(201);
  const row = await ctx.prisma.companyMercuriale.findFirstOrThrow({
    where: { companyId },
    select: { id: true },
  });
  mercurialeId = row.id;
}

function amendPolicy(policy: MercurialePromotionPolicyPayload, validFrom?: string) {
  return staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale/${mercurialeId}/amendments`)
    .send({
      reason: "Le client profite désormais des promotions",
      lines: [],
      endedSkus: [],
      promotionPolicy: policy,
      ...(validFrom === undefined ? {} : { validFrom }),
    });
}

/** −10 % au prix affiché, sur tout. */
const linePromotion = (name: string) =>
  posePromotion(
    staff(),
    promotionTerms({ internalName: name, effect: { kind: "percent_off", value: 1_000 } }),
  );

/** −10 % sur le panier, au retrait. */
const basketPromotion = (name: string) =>
  posePromotion(
    staff(),
    promotionTerms({
      internalName: name,
      effect: { kind: "percent_off", value: 1_000 },
      fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    }),
  );

async function shelfPrices(): Promise<Map<string, number>> {
  const view = jsonBody<ShopCatalogueView>(
    await ctx.asSub(MEMBER).get("/shop/catalogue/mine").expect(200),
  );
  return new Map(view.items.map((item) => [item.sku, item.unitPriceMillicents]));
}

async function quote(): Promise<MyShopQuoteView> {
  return jsonBody<MyShopQuoteView>(
    await ctx
      .asSub(MEMBER)
      .post("/shop/quote/mine")
      .send({
        lines: [
          { sku: NEGOTIATED, quantity: 10 },
          { sku: FREE, quantity: 1 },
        ],
        fulfillment: { method: "pickup", pickupAddressId: pickupId },
      })
      .expect(200),
  );
}

describe("au prix affiché", () => {
  it("« Aucune » (défaut) : prix négocié net ; l'article libre reçoit la promotion", async () => {
    await linePromotion("Automne");
    await poseMercuriale();

    const prices = await shelfPrices();
    expect(prices.get(NEGOTIATED)).toBe(NEGOTIATED_MILLICENTS);
    expect(prices.get(FREE)).toBe(FREE_MILLICENTS * 0.9);
  });

  it("« Toutes » : la promotion s'applique au prix négocié", async () => {
    await linePromotion("Automne");
    await poseMercuriale({ mode: "all", promotionIds: [] });

    expect((await shelfPrices()).get(NEGOTIATED)).toBe(NEGOTIATED_MILLICENTS * 0.9);
  });

  it("« Au choix » : seule la promotion choisie passe", async () => {
    const chosen = await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Choisie",
        effect: { kind: "percent_off", value: 1_000 },
        scope: onlyVariant(NEGOTIATED),
      }),
    );
    await poseMercuriale({ mode: "selected", promotionIds: [chosen] });
    expect((await shelfPrices()).get(NEGOTIATED)).toBe(NEGOTIATED_MILLICENTS * 0.9);

    const accepting = jsonBody<MercurialesAcceptingPromotionView>(
      await staff().get(`/admin/pricing/mercuriales/accepting-promotion/${chosen}`).expect(200),
    );
    expect(accepting).toMatchObject({
      count: 1,
      mercuriales: [{ mercurialeId, mode: "selected" }],
    });
  });
});

describe("au panier", () => {
  it("« Aucune » : la remise de panier exclut la ligne négociée de son assiette", async () => {
    await basketPromotion("Retrait");
    await poseMercuriale();

    const view = await quote();
    // 10 × 1,50 € négocié + 2,20 € libre : seule la ligne libre est remisée.
    expect(view.discountCents).toBe(22);
  });

  it("« Toutes » : la remise porte sur tout le panier", async () => {
    await basketPromotion("Retrait");
    await poseMercuriale({ mode: "all", promotionIds: [] });

    expect((await quote()).discountCents).toBe(172);
  });

  it("« Au choix » : l'assiette se juge par promotion", async () => {
    const chosen = await basketPromotion("Retrait choisi");
    await poseMercuriale({ mode: "selected", promotionIds: [chosen] });

    expect((await quote()).discountCents).toBe(172);
  });
});

describe("le changement de politique, daté", () => {
  it("un avenant qui ne porte que la politique agit à sa date, pas avant", async () => {
    await linePromotion("Automne");
    await poseMercuriale();

    await amendPolicy({ mode: "all", promotionIds: [] }, daysAgo(-5)).expect(201);
    expect((await shelfPrices()).get(NEGOTIATED)).toBe(NEGOTIATED_MILLICENTS);

    await amendPolicy({ mode: "all", promotionIds: [] }).expect(201);
    expect((await shelfPrices()).get(NEGOTIATED)).toBe(NEGOTIATED_MILLICENTS * 0.9);
  });

  it("refuse une promotion inconnue dans la liste (404), et une liste vide en « Au choix » (400)", async () => {
    await poseMercuriale();

    await amendPolicy({ mode: "selected", promotionIds: ["inconnue"] }).expect(404);
    await amendPolicy({ mode: "selected", promotionIds: [] }).expect(400);
  });

  it("une commande passée garde ses prix quand la politique change", async () => {
    await linePromotion("Automne");
    await poseMercuriale({ mode: "all", promotionIds: [] });
    const placed = jsonBody<{ id: string }>(
      await ctx
        .asSub(MEMBER)
        .post("/orders")
        .send({
          idempotencyKey: randomUUID(),
          salesTerms: null,
          fulfillmentMethod: "pickup",
          requestedWindow: { start: "07:00", end: "08:00" },
          pickupAddressId: pickupId,
          deliveryAddress: null,
          deliveryAddressId: null,
          requestedDeliveryDate: serviceDay(),
          note: "",
          lines: [{ sku: NEGOTIATED, quantity: 2 }],
        })
        .expect(201),
    );

    await amendPolicy({ mode: "none", promotionIds: [] }).expect(201);

    const line = await ctx.prisma.orderLine.findFirstOrThrow({
      where: { orderId: placed.id, sku: NEGOTIATED },
      select: { unitPriceMillicents: true },
    });
    expect(line.unitPriceMillicents).toBe(NEGOTIATED_MILLICENTS * 0.9);
    expect((await shelfPrices()).get(NEGOTIATED)).toBe(NEGOTIATED_MILLICENTS);
  });
});
