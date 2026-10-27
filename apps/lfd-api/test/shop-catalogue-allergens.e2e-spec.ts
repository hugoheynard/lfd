/**
 * E2E — **les allergènes de la vitrine publique**, du référentiel à
 * `GET /shop/catalogue?lang=` (`documentation/pim/plan-allergenes-en-boutique.md`,
 * décisions de Hugo du 2026-10-27).
 *
 * Ce que seul ce niveau prouve : que les libellés nommés AU RÉFÉRENTIEL, dans
 * ses trois langues, descendent par les faits du catalogue, se rangent au
 * commerce et ressortent dans la langue de la requête — et que les trois
 * états (déclaré, « aucun allergène », précaution) ne se confondent jamais.
 */
import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import {
  activateFiche,
  aDraftFiche,
  anActiveFiche,
  declareAllergens,
  relayAll,
  SILENT_TRIGGER,
  type Fiche,
} from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
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

type Language = "fr" | "en" | "it";

async function shop(lang: Language): Promise<ShopCatalogueView> {
  return jsonBody<ShopCatalogueView>(
    await ctx.http().get(`/shop/catalogue?lang=${lang}`).expect(200),
  );
}

async function itemIn(lang: Language, fiche: Fiche): Promise<ShopItemView | undefined> {
  return (await shop(lang)).items.find((item) => item.sku === fiche.sku);
}

/** Le geste « valider » du staff : un article neuf attend sa relecture (lot 3). */
async function approve(fiches: readonly Fiche[]): Promise<void> {
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus: fiches.map((fiche) => fiche.variantSku), audiences: ["pro", "public"] })
    .expect(204);
}

/** Les libellés du référentiel semé par les migrations, langue par langue. */
const GLUTEN = {
  fr: "Céréales contenant du gluten",
  en: "Cereals containing gluten",
  it: "Cereali contenenti glutine",
};
const MILK = { fr: "Lait", en: "Milk", it: "Latte" };
const NUTS = { fr: "Fruits à coque", en: "Tree nuts", it: "Frutta a guscio" };
const LANGUAGES: readonly Language[] = ["fr", "en", "it"];

/** Brioche déclarée (blé, lait ; traces de fruits à coque), puis publiée. */
async function aDeclaredBrioche(): Promise<Fiche> {
  const draft = await aDraftFiche(staff, "Brioche");
  await declareAllergens(staff, draft, ["UW", "AM"], ["SA"]);
  return activateFiche(staff, draft, null, null);
}

describe("la vitrine dit les allergènes, dans la langue de la requête", () => {
  it("une fiche déclarée : ses allergènes puis ses traces, en fr, en et it", async () => {
    const brioche = await aDeclaredBrioche();
    await relayAll(ctx);
    await approve([brioche]);

    for (const lang of LANGUAGES) {
      expect((await itemIn(lang, brioche))?.allergens).toEqual({
        state: "declared",
        contains: [GLUTEN[lang], MILK[lang]],
        mayContain: [NUTS[lang]],
      });
    }
  });

  it("une fiche qui déclare « aucun allergène » le dit, sans trace", async () => {
    const pain = await anActiveFiche(staff, "Pain", null, []);
    await relayAll(ctx);
    await approve([pain]);

    for (const lang of LANGUAGES) {
      expect((await itemIn(lang, pain))?.allergens).toEqual({
        state: "none",
        contains: [],
        mayContain: [],
      });
    }
  });

  it("une fiche sans déclaration part par précaution, avec les traces du catalogue publié", async () => {
    const brioche = await aDeclaredBrioche();
    await relayAll(ctx);
    const fougasse = await anActiveFiche(staff, "Fougasse", null, null);
    await relayAll(ctx);
    await approve([brioche, fougasse]);

    for (const lang of LANGUAGES) {
      const allergens = (await itemIn(lang, fougasse))?.allergens;
      expect(allergens?.state).toBe("precautionary");
      expect(allergens?.contains).toEqual([]);
      expect([...(allergens?.mayContain ?? [])].sort()).toEqual([GLUTEN[lang], MILK[lang]].sort());
    }
  });
});
