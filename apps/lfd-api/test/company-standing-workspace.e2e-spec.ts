/**
 * E2E de **l'espace de travail d'un héritier** (plan
 * `documentation/comptes-client/plan-entrer-dans-ses-sites.md`, R4, R5) — le
 * mur tenant, côté résolution de la société.
 *
 * Ce que seul l'e2e prouve : le `Principal` relu en base porte les sites
 * atteints À CÔTÉ des rattachements propres ; sans en-tête, le prix servi ne
 * change pas pour un principal existant ; déclaré, un site atteint est servi,
 * un site frère jamais ; `GET /me` liste les sites « via » leur principal.
 *
 * Le prix observé est la remise d'un point de retrait réservée aux PROS : elle
 * dit si une société active a été servie (remise) ou personne (aucune).
 */
import type { AccountView, CreatedPickupResponse, ShopQuoteView } from "@lfd/contracts";
import { WORKSPACE_HEADER } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { bootCustomerScene, company, member } from "./order-customer-cancel-scene.js";
import { resetScene } from "./order-staff-cancel-scene.js";
import { detach, family, type Person, setStatus } from "./company-standing-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootCustomerScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
});

/** Un point de retrait qui remet 10 %, aux PROS seulement. */
async function prosOnlyPoint(): Promise<string> {
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/pickup-addresses")
    .send({
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
      discounts: {
        b2b: {
          adjustment: { mode: "percent", bp: 1_000 },
          scope: "all_except",
          categories: [],
          products: [],
        },
        b2c: null,
      },
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

/** La remise du devis reconnu, avec ou sans espace de travail déclaré. */
async function discount(who: Person, point: string, declared?: string): Promise<number> {
  const call = ctx.asSub(who.sub).post("/shop/quote/mine");
  const withHeader = declared === undefined ? call : call.set(WORKSPACE_HEADER, declared);
  const view = jsonBody<ShopQuoteView>(
    await withHeader
      .send({
        lines: [{ sku: "VIE-001", quantity: 10 }],
        fulfillment: { method: "pickup", pickupAddressId: point },
      })
      .expect(200),
  );
  return view.discountCents;
}

describe("R4 — la société servie sans en-tête ne change pas", () => {
  it("🔴 le détenteur d'un principal qui atteint deux sites garde son prix pro sans rien déclarer", async () => {
    const f = await family();
    const point = await prosOnlyPoint();
    expect(await discount(f.heir, point)).toBeGreaterThan(0);
  });

  it("deux rattachements propres, sans en-tête : personne n'est servi, sites compris", async () => {
    const f = await family();
    await member(f.heir.id, await company(), { role: CustomerRole.owner });
    const point = await prosOnlyPoint();
    expect(await discount(f.heir, point)).toBe(0);
  });
});

describe("R4 — une société déclarée", () => {
  it("🔴 un site atteint est servi ; un site frère d'une AUTRE famille, jamais", async () => {
    const f = await family();
    const other = await family();
    await member(f.heir.id, await company(), { role: CustomerRole.owner }); // deux espaces
    const point = await prosOnlyPoint();

    expect(await discount(f.heir, point, f.site)).toBeGreaterThan(0);
    expect(await discount(f.heir, point, other.site)).toBe(0);
  });

  it("🔴 un membre de site qui déclare son principal n'y est pas servi", async () => {
    const f = await family();
    await member(f.siteOwner.id, await company(), { role: CustomerRole.owner });
    const point = await prosOnlyPoint();
    expect(await discount(f.siteOwner, point, f.principal)).toBe(0);
  });

  it("🔴 détaché : le site déclaré n'est plus servi à la requête suivante (R6)", async () => {
    const f = await family();
    await member(f.heir.id, await company(), { role: CustomerRole.owner });
    const point = await prosOnlyPoint();
    expect(await discount(f.heir, point, f.site)).toBeGreaterThan(0);
    await detach(f.site);
    expect(await discount(f.heir, point, f.site)).toBe(0);
  });
});

describe("GET /me — les sites atteignables du sélecteur (R5)", () => {
  async function me(who: Person): Promise<AccountView> {
    return jsonBody<AccountView>(await ctx.asSub(who.sub).get("/me").expect(200));
  }

  it("l'héritier voit ses sites « via » son principal, à côté de ses sociétés propres", async () => {
    const f = await family();
    const view = await me(f.heir);
    expect(view.companies.map((c) => c.id)).toEqual([f.principal]);
    expect(view.reachableSites?.map((s) => s.companyId).sort()).toEqual([f.site, f.sibling].sort());
    expect(view.reachableSites?.every((s) => s.via.companyId === f.principal)).toBe(true);
  });

  it("🔴 un membre de site ne voit ni son principal ni son frère", async () => {
    const f = await family();
    expect((await me(f.siteOwner)).reachableSites).toEqual([]);
  });

  it("🔴 principal suspendu, site suspendu, site détaché : retirés de la liste", async () => {
    const f = await family();
    await setStatus(f.site, CompanyStatus.suspended);
    await detach(f.sibling);
    expect((await me(f.heir)).reachableSites).toEqual([]);

    const g = await family();
    await setStatus(g.principal, CompanyStatus.suspended);
    expect((await me(g.heir)).reachableSites).toEqual([]);
  });

  it("un site où l'héritier est aussi membre propre n'est listé qu'une fois, parmi les siennes", async () => {
    const f = await family();
    await member(f.heir.id, f.site, { role: CustomerRole.orders });
    const view = await me(f.heir);
    expect(view.companies.map((c) => c.id).sort()).toEqual([f.principal, f.site].sort());
    expect(view.reachableSites?.map((s) => s.companyId)).toEqual([f.sibling]);
  });
});
