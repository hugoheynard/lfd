/**
 * E2E : **le staff voit la carte d'un site sur sa grille de prix et ses
 * mercuriales** (plan `documentation/comptes-client/plan-carte-des-sites.md`,
 * § 3.6).
 *
 * - l'article hors carte reste dans la grille, nommé dans `offMenuSkus` de
 *   sa famille — même masqué au site ;
 * - une mercuriale se pose dessus (le prix négocié survit à la carte), et sa
 *   ligne porte `lockedReason: "off_menu"`.
 *
 * Doublée : la signature des jetons (le jeton EST le `sub`).
 */
import type { CompanyPricingView } from "@lfd/contracts";

import { SubAccountMenu } from "../src/lafoliecoffee/account/domain/entities/sub-account-menu.js";
import type { MenuStamp } from "../src/lafoliecoffee/account/domain/value-objects/sub-account-menu-terms.js";
import { PrismaSubAccountMenuRepository } from "../src/lafoliecoffee/account/infrastructure/prisma-sub-account-menu.repository.js";
import { ShelfChanges } from "../src/lafoliecoffee/shared/shelf-changes/domain/ports/shelf-changes.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (sub: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: sub, scopes: [] }),
};

/** Les signaux des rayons : le dépôt les émet, ce test ne les lit pas. */
class SilentShelfChanges extends ShelfChanges {
  changed(): void {}
}

/** L'article hors carte, fermé par sa famille. */
const X = "PAI-001-1";
/** Un article d'une autre famille, resté dans la carte. */
const OPEN = "VIE-001-1";

const STAMP: MenuStamp = { author: { kind: "staff", staffId: "stf_menu" }, at: new Date(0) };

let ctx: E2eContext;
let principal = "";
let site = "";

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
  principal = (await createCompany(ctx.prisma, { enseigne: "Club" })).id;
  site = (await createCompany(ctx.prisma, { enseigne: "Chalet du Club" })).id;
  await ctx.prisma.company.update({ where: { id: site }, data: { parentCompanyId: principal } });
  const item = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { sku: X },
    select: { categoryId: true },
  });
  // Masqué au site : le staff le voit quand même, étiqueté.
  const menu = SubAccountMenu.compose({
    companyId: site,
    principalCompanyId: principal,
    mode: "except",
    offMenu: "hidden",
    stamp: STAMP,
  });
  menu.exclude({ id: "ent_family", level: "family", ref: item.categoryId }, STAMP);
  await new PrismaSubAccountMenuRepository(ctx.prisma, new SilentShelfChanges()).save(menu);
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function pricingOfSite(): Promise<CompanyPricingView> {
  return jsonBody<CompanyPricingView>(
    await staff().get(`/admin/pricing/companies/${site}`).expect(200),
  );
}

describe("la grille de prix d'un site (§ 3.6)", () => {
  it("garde l'article hors carte, nommé dans `offMenuSkus` de sa famille", async () => {
    const pricing = await pricingOfSite();

    const skus = pricing.categories.flatMap((category) => category.items.map((i) => i.sku));
    expect(skus).toEqual(expect.arrayContaining([X, OPEN]));
    const offMenu = pricing.categories.flatMap((category) => category.offMenuSkus);
    expect(offMenu).toContain(X);
    expect(offMenu).not.toContain(OPEN);
  });

  it("le principal, lui, n'a aucun article hors carte", async () => {
    const pricing = jsonBody<CompanyPricingView>(
      await staff().get(`/admin/pricing/companies/${principal}`).expect(200),
    );
    expect(pricing.categories.flatMap((category) => category.offMenuSkus)).toEqual([]);
  });
});

describe("la mercuriale d'un site (§ 3.6)", () => {
  it("se pose sur un article hors carte, et sa ligne est étiquetée « hors carte »", async () => {
    await staff()
      .post(`/admin/pricing/companies/${site}/mercuriale`)
      .set(INTENT_KEY, freshIntent())
      .send({
        label: "Mercuriale du chalet",
        validFrom: daysAgo(1),
        validTo: daysAgo(-90),
        lines: [
          { sku: X, unitPriceMillicents: 150_000 },
          { sku: OPEN, unitPriceMillicents: 90_000 },
        ],
      })
      .expect(201);

    const lines = (await pricingOfSite()).mercuriales[0]?.lines ?? [];
    expect(lines.find((line) => line.sku === X)?.lockedReason).toBe("off_menu");
    expect(lines.find((line) => line.sku === OPEN)).not.toHaveProperty("lockedReason");
  });
});
