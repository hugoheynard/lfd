/**
 * E2E des **listes de points de retrait par clientèle** et de la
 * **présélection** (Hugo, 2026-10-15) : le site par défaut a disparu, la
 * liste est filtrée AU SERVEUR, et une commande sans point choisi suit la
 * règle `preselectedPickupId` — le point préféré, sinon le seul ouvert, sinon
 * un refus qui demande de choisir.
 *
 * Ce que seul le vrai chemin prouve : le `where` par clientèle en base, la
 * clientèle déduite de la société agissante, et que `is_default` — resté en
 * base — n'est plus lu par personne.
 */
import {
  type CreatedPickupResponse,
  PICKUP_CHOICE_REQUIRED,
  type PickupAddressView,
  type PickupDiscountAudiences,
  pickupDiscountFor,
  type ShopQuoteView,
} from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const PERSO = "auth0|listes-perso";
const ACTIVE = "auth0|listes-active";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
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

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un perso, et un pro d'une société active ; rend l'id de la société. */
async function seedPeople(): Promise<string> {
  await createUser(ctx.prisma, { auth0Sub: PERSO });
  const active = await createUser(ctx.prisma, { auth0Sub: ACTIVE });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, active.id, company.id, CustomerRole.owner);
  return company.id;
}

/** Un site créé comme le back-office le crée, puis réservé si demandé. */
async function seedSite(
  label: string,
  audiences?: PickupDiscountAudiences,
  discountCents = 0,
): Promise<string> {
  const response = await staff()
    .post("/admin/pickup-addresses")
    .send({
      label,
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      // Une remise propre à chaque site : c'est elle qui dit, au devis, quel
      // point a été retenu sans qu'on l'ait choisi.
      discount: discountCents === 0 ? null : { mode: "amount", cents: discountCents },
    })
    .expect(201);
  const id = jsonBody<CreatedPickupResponse>(response).id;
  if (audiences !== undefined) {
    await staff()
      .put(`/admin/sites/${id}/roles`)
      .send({
        pickup: true,
        supply: "on_site",
        deliveryDeparture: false,
        transferMode: "integrated",
        counterSetupMinutes: 0,
        pickupAudiences: audiences,
      })
      .expect(204);
  }
  return id;
}

const labels = (points: readonly PickupAddressView[]): readonly string[] =>
  points.map((point) => point.label);

async function listed(agent: ReturnType<E2eContext["asSub"]>, url: string) {
  return labels(jsonBody<readonly PickupAddressView[]>(await agent.get(url).expect(200)));
}

/** Un devis en retrait SANS point choisi — le seul chemin où le serveur présélectionne. */
const UNCHOSEN = {
  lines: [{ sku: "VIE-001", quantity: 10 }],
  fulfillment: { method: "pickup", pickupAddressId: null },
};

/** La remise du point retenu, lue sur le devis : elle nomme le point. */
function quotedDiscount(response: request.Response): unknown {
  return jsonBody<ShopQuoteView>(response).discountAdjustment;
}

describe("les listes, filtrées au serveur", () => {
  it("le visiteur ne voit que les sites ouverts aux particuliers", async () => {
    await seedSite("Les deux");
    await seedSite("Pros seulement", { b2b: true, b2c: false });
    await seedSite("Particuliers seulement", { b2b: false, b2c: true });

    expect(await listed(ctx.http(), "/pickup-addresses")).toEqual([
      "Les deux",
      "Particuliers seulement",
    ]);
  });

  /** Hugo, 2026-10-19 : la landing pro publique lit les points pros sans compte. */
  it("?audience=pro rend au visiteur les sites ouverts aux pros, avec leur remise", async () => {
    await seedSite("Les deux", undefined, 100);
    await seedSite("Pros seulement", { b2b: true, b2c: false }, 200);
    await seedSite("Particuliers seulement", { b2b: false, b2c: true }, 300);

    const response = await ctx.http().get("/pickup-addresses?audience=pro").expect(200);
    const points = jsonBody<readonly PickupAddressView[]>(response);

    expect(labels(points)).toEqual(["Les deux", "Pros seulement"]);
    expect(points.map((point) => pickupDiscountFor(point, "b2b"))).toEqual([
      { mode: "amount", cents: 100 },
      { mode: "amount", cents: 200 },
    ]);
    expect(Object.keys(points[0] ?? {}).sort()).toEqual(
      ["codePostal", "discount", "discountAudiences", "gps", "id", "label", "ligne1", "ligne2"]
        .concat(["opening", "pays", "pickupAudiences", "ville"])
        .sort(),
    );
  });

  it("refuse une clientèle inconnue plutôt que de rendre celle du particulier", async () => {
    await ctx.http().get("/pickup-addresses?audience=xx").expect(400);
    await ctx.http().get("/pickup-addresses?audience=b2c").expect(400);
  });

  it("le pro ne voit que les siens, l'espace perso ceux des particuliers", async () => {
    await seedPeople();
    await seedSite("Les deux");
    await seedSite("Pros seulement", { b2b: true, b2c: false });
    await seedSite("Particuliers seulement", { b2b: false, b2c: true });

    expect(await listed(ctx.asSub(ACTIVE), "/pickup-addresses/mine")).toEqual([
      "Les deux",
      "Pros seulement",
    ]);
    expect(await listed(ctx.asSub(PERSO), "/pickup-addresses/mine")).toEqual([
      "Les deux",
      "Particuliers seulement",
    ]);
  });

  it("refuse la liste « mine » sans jeton", async () => {
    await ctx.http().get("/pickup-addresses/mine").expect(401);
  });

  it("l'équipe lit ceux d'un client choisi, ou tous", async () => {
    const companyId = await seedPeople();
    await seedSite("Les deux");
    await seedSite("Pros seulement", { b2b: true, b2c: false });
    await seedSite("Particuliers seulement", { b2b: false, b2c: true });

    expect(await listed(staff(), `/admin/pickup-addresses?companyId=${companyId}`)).toEqual([
      "Les deux",
      "Pros seulement",
    ]);
    expect(await listed(staff(), "/admin/pickup-addresses")).toEqual([
      "Les deux",
      "Pros seulement",
      "Particuliers seulement",
    ]);
  });
});

/**
 * Les trois passations refusent déjà un retrait sans point au schéma (400,
 * « point de retrait requis ») : seul le DEVIS de la boutique arrive au
 * serveur sans point, et c'est là que la présélection se joue.
 */
describe("la présélection — un devis en retrait sans point choisi", () => {
  it("retient le seul site ouvert à la clientèle du visiteur", async () => {
    await seedSite("Pros seulement", { b2b: true, b2c: false }, 100);
    await seedSite("Particuliers seulement", { b2b: false, b2c: true }, 300);

    const response = await ctx.http().post("/shop/quote").send(UNCHOSEN).expect(200);

    expect(quotedDiscount(response)).toEqual({ mode: "amount", cents: 300 });
  });

  it("refuse de choisir à la place du client quand plusieurs sont ouverts", async () => {
    await seedPeople();
    await seedSite("Labo", undefined, 100);
    await seedSite("Village", undefined, 200);

    const response = await ctx.asSub(ACTIVE).post("/shop/quote/mine").send(UNCHOSEN).expect(409);

    expect((response.body as { code?: string }).code).toBe(PICKUP_CHOICE_REQUIRED);
  });

  it("retient le point préféré de la société parmi plusieurs", async () => {
    const companyId = await seedPeople();
    await seedSite("Labo", undefined, 100);
    const village = await seedSite("Village", undefined, 200);
    await ctx
      .asSub(ACTIVE)
      .patch(`/companies/${companyId}/fulfillment-preference`)
      .send({ method: "pickup", pickupAddressId: village })
      .expect(204);

    const response = await ctx.asSub(ACTIVE).post("/shop/quote/mine").send(UNCHOSEN).expect(200);

    expect(quotedDiscount(response)).toEqual({ mode: "amount", cents: 200 });
  });

  /**
   * `is_default` reste en base (§0 : une colonne morte ne se supprime pas
   * sans ordre). Posée à la main sur un site, elle ne décide plus rien : ni
   * l'ordre de la liste, ni le point d'un devis sans choix.
   */
  it("ne lit plus is_default, même posée en base", async () => {
    await seedSite("Labo", undefined, 100);
    const village = await seedSite("Village", undefined, 200);
    await ctx.prisma.$executeRaw`UPDATE pickup_addresses SET is_default = (id = ${village})`;

    expect(await listed(ctx.http(), "/pickup-addresses")).toEqual(["Labo", "Village"]);
    const response = await ctx.http().post("/shop/quote").send(UNCHOSEN).expect(409);
    expect((response.body as { code?: string }).code).toBe(PICKUP_CHOICE_REQUIRED);
  });
});
