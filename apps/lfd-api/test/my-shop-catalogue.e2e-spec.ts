import { randomUUID } from "node:crypto";

/**
 * E2E de **la vitrine au prix du client** — `GET /companies/:id/shop-catalogue`.
 *
 * Trois choses que seul ce niveau prouve, et ce sont les trois qui coûtent :
 *
 * 1. la route est **murée** — un curieux qui devine un identifiant de société ne
 *    peut pas y lire la mercuriale d'un concurrent ;
 * 2. le prix servi est celui que la **caisse** appliquerait à ce client, parce
 *    qu'il passe par la même résolution que la commande ;
 * 3. la vitrine **publique** ne bouge pas d'un centime : c'est un second chemin,
 *    pas une modification du premier.
 */
import { CustomerRole } from "../src/platform/database/client/client.js";
import type { PlacedOrderResponse, ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/** L'intention change à chaque appel : la colonne est `@unique`. */
let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      id: `pi_${String(intentCounter)}`,
      clientSecret: `secret_${String(intentCounter)}`,
    });
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

const MEMBER = "auth0|membre";
const STRANGER = "auth0|etranger";

/** VIE-001 vaut 2,00 € dans le catalogue qui facture. */
const SKU = "VIE-001";
const CANONICAL_MILLICENTS = 200_000;
const NEGOTIATED_MILLICENTS = 150_000;

let companyId = "";
/** Un panier a besoin d'un acheminement pour exister. */
let pickupId = "";

beforeEach(async () => {
  await ctx.reset();
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await createUser(ctx.prisma, { auth0Sub: STRANGER });
  const company = await createCompany(ctx.prisma);
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.orders);
  companyId = company.id;
  const point = await ctx.prisma.pickupAddress.create({
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

const staff = () => ctx.asSub("staff-e2e");

/** Pose une mercuriale sur cet article, par la route du back-office. */
async function poseMercuriale(): Promise<void> {
  await staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Mercuriale Club Med",
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2027-12-31T00:00:00.000Z",
      lines: [{ sku: SKU, unitPriceMillicents: NEGOTIATED_MILLICENTS }],
    })
    .expect(201);
}

const mine = async (): Promise<ShopCatalogueView> =>
  jsonBody<ShopCatalogueView>(await ctx.asSub(MEMBER).get("/shop/catalogue/mine").expect(200));

function itemOf(view: ShopCatalogueView, sku: string): ShopItemView | undefined {
  return view.items.find((item) => item.sku === sku);
}

describe("le mur", () => {
  it("🔴 ne donne RIEN à sonder : un curieux n'a aucun identifiant à passer", async () => {
    // Le mur est inexprimable, pas vérifié. L'URL ne porte pas de société — elle
    // vient du contexte, résolu depuis les rattachements du demandeur. Un
    // étranger rattaché à rien lit donc le tarif catalogue, quoi qu'il tente.
    await poseMercuriale();

    const seen = jsonBody<ShopCatalogueView>(
      await ctx.asSub(STRANGER).get("/shop/catalogue/mine").expect(200),
    );

    expect(itemOf(seen, SKU)?.unitPriceMillicents).toBe(CANONICAL_MILLICENTS);
    expect(itemOf(seen, SKU)?.catalogPriceMillicents).toBeUndefined();
  });

  it("🔴 ignore un en-tête d'espace de travail qui ment", async () => {
    // L'en-tête vient du réseau : il sert à DÉPARTAGER plusieurs rattachements,
    // jamais à en désigner un qu'on n'a pas. Sans cette confrontation, il
    // suffirait de le réécrire pour lire la mercuriale d'un concurrent.
    await poseMercuriale();

    const seen = jsonBody<ShopCatalogueView>(
      await ctx
        .asSub(STRANGER)
        .get("/shop/catalogue/mine")
        .set("x-lfc-company", companyId)
        .expect(200),
    );

    expect(itemOf(seen, SKU)?.unitPriceMillicents).toBe(CANONICAL_MILLICENTS);
  });

  it("refuse un visiteur sans jeton — la vitrine PUBLIQUE est ailleurs", async () => {
    await ctx.http().get("/shop/catalogue/mine").expect(401);
  });
});

describe("le prix servi", () => {
  it("applique la mercuriale du client", async () => {
    await poseMercuriale();

    const item = itemOf(await mine(), SKU);

    expect(item?.unitPriceMillicents).toBe(NEGOTIATED_MILLICENTS);
  });

  it("porte le tarif catalogue à BARRER, et lui seul", async () => {
    // Le tarif catalogue, jamais un prix public promotionnel : une mercuriale
    // scelle, donc ce client n'aurait de toute façon pas eu la promotion.
    await poseMercuriale();

    expect(itemOf(await mine(), SKU)?.catalogPriceMillicents).toBe(CANONICAL_MILLICENTS);
  });

  it("ne barre RIEN sur un article que la mercuriale ne vise pas", async () => {
    // Une rature sur deux prix identiques ferait chercher une remise qui
    // n'existe pas.
    await poseMercuriale();

    const other = (await mine()).items.find((item) => item.sku !== SKU);
    expect(other?.catalogPriceMillicents).toBeUndefined();
  });

  it("rend le tarif catalogue à un client SANS mercuriale", async () => {
    const item = itemOf(await mine(), SKU);

    expect(item?.unitPriceMillicents).toBe(CANONICAL_MILLICENTS);
    expect(item?.catalogPriceMillicents).toBeUndefined();
  });
});

describe("la vitrine publique", () => {
  it("🔴 ne bouge pas d'un centime, mercuriale posée ou non", async () => {
    // C'est un SECOND chemin, pas une modification du premier. La boutique se
    // visite sans compte, et ce qu'un prospect y lit ne doit pas dépendre de ce
    // qu'on a négocié avec quelqu'un d'autre.
    await poseMercuriale();

    const publique = jsonBody<ShopCatalogueView>(
      await ctx.http().get("/shop/catalogue").expect(200),
    );

    const item = itemOf(publique, SKU);
    expect(item?.unitPriceMillicents).toBe(CANONICAL_MILLICENTS);
    // ABSENT du fil, pas nul : la surface publique reste étroite, et un e2e
    // voisin énumère ses clés pour que ça le reste.
    expect(item).not.toHaveProperty("catalogPriceMillicents");
  });

  it("montre les MÊMES articles et les mêmes rayons que la route reconnue", async () => {
    // Les deux passent par `shopCatalogueOf`. Une boutique qui montrerait à un
    // client un article que l'autre ne voit pas est le genre d'écart qu'on ne
    // découvre qu'au téléphone.
    await poseMercuriale();

    const publique = jsonBody<ShopCatalogueView>(
      await ctx.http().get("/shop/catalogue").expect(200),
    );
    const reconnue = await mine();

    expect(reconnue.items.map((item) => item.sku)).toEqual(publique.items.map((item) => item.sku));
    expect(reconnue.shelves).toEqual(publique.shelves);
  });
});

/**
 * **Le règlement choisi** — la contrepartie de la vitrine au prix du client.
 *
 * Afficher un tarif négocié n'a de sens que si la commande le porte, donc si
 * elle porte la société. Et dès qu'elle la porte, le règlement devient une
 * question : jusqu'ici le serveur décidait seul, et une société à qui le
 * mensuel avait été accordé ne pouvait plus payer comptant.
 */
describe("le règlement choisi", () => {
  const place = (body: Record<string, unknown>) =>
    ctx
      .asSub(MEMBER)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        deliveryAddress: null,
        deliveryAddressId: null,
        requestedDeliveryDate: serviceDay(),
        note: "",
        lines: [{ sku: SKU, quantity: 2 }],
        ...body,
      });

  it("facture la commande de boutique à la MERCURIALE, une fois la société portée", async () => {
    // 🔴 Le test qui donne son sens à tout le reste : sans lui, la vitrine
    // afficherait un prix que la caisse n'applique pas.
    await poseMercuriale();

    const placed = jsonBody<{ id: string }>(await place({}).expect(201));
    const line = await ctx.prisma.orderLine.findFirst({
      where: { orderId: placed.id, sku: SKU },
      select: { unitPriceMillicents: true },
    });

    expect(line?.unitPriceMillicents).toBe(NEGOTIATED_MILLICENTS);
  });

  it("laisse payer par CARTE une société à qui le mensuel est accordé", async () => {
    // Payer comptant avec son propre tarif est un droit, pas une exception. Le
    // serveur décidait seul jusqu'ici, et le refusait à qui avait du crédit.
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { status: "active", grantedTerms: ["monthly"] },
    });

    const placed = jsonBody<PlacedOrderResponse>(await place({ settlement: "card" }).expect(201));

    // Une intention de paiement est rendue : il y a une carte à débiter.
    expect(placed.payment?.clientSecret).toBeDefined();
  });

  it("refuse le COMPTE quand aucun terme n'a été accordé, au lieu de prélever en silence", async () => {
    // Rabattre sur la carte sans le dire ferait prélever quelqu'un qui croyait
    // commander au compte — le genre de surprise qui se règle au téléphone.
    await place({ settlement: "account" }).expect(409);
  });

  it("garde la décision AUTOMATIQUE quand rien n'est demandé", async () => {
    // Le chemin du back-office, qui n'a personne devant l'écran pour choisir :
    // au compte si les termes sont accordés, par carte sinon.
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { status: "active", grantedTerms: ["monthly"] },
    });

    const placed = jsonBody<PlacedOrderResponse>(await place({}).expect(201));

    // AUCUNE intention : la commande part au compte. La clé est absente, pas
    // nulle — le contrat l'a rendue facultative pour que « pas de carte » ne
    // s'écrive pas comme « carte sans secret ».
    expect(placed.payment).toBeUndefined();
  });
});
