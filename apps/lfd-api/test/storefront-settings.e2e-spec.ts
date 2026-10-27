/**
 * E2E — **la place des allergènes en boutique**, réglage global de la vitrine
 * (Hugo, 2026-10-27, `documentation/pim/plan-allergenes-en-boutique.md`).
 *
 * Ce que seul ce niveau prouve : la contrainte en base, le mur de la
 * ressource `b2b_storefront`, la trace au journal avec son auteur, et que la
 * page publique — sans jeton — porte le réglage sur tout rayon.
 */
import type { PublicStorefrontPageView, StorefrontSettingsView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

const SETTINGS = "/admin/storefront/settings";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
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

async function publicPage(shelfKey: string): Promise<PublicStorefrontPageView> {
  return jsonBody<PublicStorefrontPageView>(
    await ctx.http().get(`/shop/storefront/${shelfKey}`).expect(200),
  );
}

describe("la place des allergènes en boutique", () => {
  it("vaut « fiche ouverte seulement » tant que personne ne l'a réglée", async () => {
    expect(jsonBody<StorefrontSettingsView>(await staff().get(SETTINGS).expect(200))).toEqual({
      allergenDisplay: "sheet",
      updatedAt: null,
    });
    expect((await publicPage("all")).allergenDisplay).toBe("sheet");
  });

  it("se règle, se sert sans jeton sur tout rayon, et se trace avec son auteur", async () => {
    await staff().put(SETTINGS).send({ allergenDisplay: "gallery" }).expect(204);

    expect((await publicPage("all")).allergenDisplay).toBe("gallery");
    expect((await publicPage("home")).allergenDisplay).toBe("gallery");
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "storefront.allergen_display_changed" },
      select: { actorId: true, payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.actorId).toBe(E2E_STAFF_ID);
    expect(facts[0]?.payload).toMatchObject({ from: "sheet", to: "gallery" });
  });

  it("ne trace rien quand la valeur ne change pas", async () => {
    await staff().put(SETTINGS).send({ allergenDisplay: "sheet" }).expect(204);

    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "storefront.allergen_display_changed" },
      }),
    ).toBe(0);
  });

  it("refuse une place inconnue (400), et la base aussi", async () => {
    await staff().put(SETTINGS).send({ allergenDisplay: "cart" }).expect(400);
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "public"."storefront_settings" ("id", "allergen_display", "updated_at", "updated_by_staff_id") VALUES ('main', 'cart', now(), 'x')`,
      ),
    ).rejects.toThrow();
  });

  it("refuse un visiteur sans jeton", async () => {
    const { status } = await ctx.http().put(SETTINGS).send({ allergenDisplay: "gallery" });

    expect(status).toBe(401);
  });
});
