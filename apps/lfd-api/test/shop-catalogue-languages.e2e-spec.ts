/**
 * E2E — **les langues de la vitrine publique**, du référentiel à
 * `GET /shop/catalogue?lang=` (lot des langues, 2026-10-18 —
 * `documentation/webhooks/plan-webhook-vitrine.md` §6).
 *
 * Ce que seul ce niveau prouve : qu'une traduction saisie AU RÉFÉRENTIEL —
 * nom de déclinaison, ligne de vitrine, nom de famille — descend par les faits
 * du catalogue, se range au commerce et ressort dans la langue demandée, avec
 * le français en repli. Et que la vue publique, dans toutes les langues, ne
 * sert jamais un article réservé aux pros.
 */
import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";

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

/** La vitrine publique, sans jeton, dans une langue — ou sans paramètre. */
async function shop(lang?: string): Promise<ShopCatalogueView> {
  const path = lang === undefined ? "/shop/catalogue" : `/shop/catalogue?lang=${lang}`;
  return jsonBody<ShopCatalogueView>(await ctx.http().get(path).expect(200));
}

function itemOf(view: ShopCatalogueView, fiche: Fiche): ShopItemView | undefined {
  return view.items.find((item) => item.sku === fiche.sku);
}

function shelfNameOf(view: ShopCatalogueView, fiche: Fiche): string | undefined {
  return view.shelves.find((shelf) => shelf.id === fiche.categoryId)?.name;
}

/** Le geste « valider » du staff : un article neuf attend sa relecture (lot 3). */
async function approve(fiches: readonly Fiche[]): Promise<void> {
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus: fiches.map((fiche) => fiche.variantSku), audiences: ["pro", "public"] })
    .expect(204);
}

async function defaultVariantId(fiche: Fiche): Promise<string> {
  const detail = jsonBody<{ variants: { id: string; isDefault: boolean }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  return detail.variants.find((variant) => variant.isDefault)?.id ?? "";
}

/**
 * Une fiche vendue au public, traduite au référentiel : le nom de sa
 * déclinaison en anglais, sa ligne en italien seulement, sa famille en
 * anglais — chaque langue a donc un texte traduit et un texte en repli.
 */
async function aTranslatedFiche(): Promise<Fiche> {
  const fiche = await anActiveFiche(staff, "Croissant");
  const variantId = await defaultVariantId(fiche);
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${variantId}/name`)
    .send({ name: { fr: "Croissant", en: "Butter croissant" } })
    .expect(200);
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/editorial`)
    .send({ descriptionShort: { fr: "Tourage patient", it: "Sfogliatura paziente" } })
    .expect(200);
  await staff()
    .put(`${CATEGORIES}/${fiche.categoryId}/name`)
    .send({ name: { fr: "Viennoiseries", en: "Pastries" } })
    .expect(200);
  return fiche;
}

describe("la vitrine publique dans les trois langues", () => {
  it("sert en anglais ce que le référentiel a traduit, en français le reste", async () => {
    const fiche = await aTranslatedFiche();
    await relayAll(ctx);
    await approve([fiche]);

    const english = await shop("en");

    expect(itemOf(english, fiche)).toMatchObject({
      name: "Butter croissant",
      // Pas d'anglais pour la ligne : le français, jamais une chaîne vide.
      note: "Tourage patient",
    });
    expect(shelfNameOf(english, fiche)).toBe("Pastries");
  });

  it("sert en italien la ligne traduite, et le nom en français faute d'italien", async () => {
    const fiche = await aTranslatedFiche();
    await relayAll(ctx);
    await approve([fiche]);

    const italian = await shop("it");

    expect(itemOf(italian, fiche)).toMatchObject({
      name: "Croissant",
      note: "Sfogliatura paziente",
    });
    expect(shelfNameOf(italian, fiche)).toBe("Viennoiseries");
  });

  /** La boutique déployée ne passe aucun paramètre : elle doit lire la vue d'avant. */
  it("sert le français sans paramètre, comme avant le lot", async () => {
    const fiche = await aTranslatedFiche();
    await relayAll(ctx);
    await approve([fiche]);

    const view = await shop();

    expect(itemOf(view, fiche)).toMatchObject({ name: "Croissant", note: "Tourage patient" });
    expect(shelfNameOf(view, fiche)).toBe("Viennoiseries");
    expect(await shop("fr")).toEqual(view);
  });

  /**
   * Régression (production, 2026-10-18) : le staff traduit le nom de la FICHE,
   * pas celui de sa déclinaison unique — et la vitrine anglaise restait en
   * français sur les 292 fiches.
   */
  it("sert la traduction de la fiche quand la déclinaison porte son nom sans traduction", async () => {
    const fiche = await anActiveFiche(staff, "Roulé à la cannelle");
    await staff()
      .put(`${PRODUCTS}/${fiche.id}/identity`)
      .send({
        name: { fr: "Roulé à la cannelle", en: "Cinnamon rolls" },
        kind: "daily",
        categoryId: fiche.categoryId,
      })
      .expect(200);
    await relayAll(ctx);
    await approve([fiche]);

    expect(itemOf(await shop("en"), fiche)?.name).toBe("Cinnamon rolls");
    expect(itemOf(await shop("it"), fiche)?.name).toBe("Roulé à la cannelle");
  });

  it("refuse une langue que la boutique ne sert pas, en la nommant", async () => {
    const refusal = await ctx.http().get("/shop/catalogue?lang=de").expect(400);

    const body = jsonBody<{ code: string; message: string }>(refusal);
    expect(body.code).toBe("http.payload.invalid");
    expect(body.message).toContain("« lang » accepte fr, en, it");
  });
});

describe("l'audience sort, et jamais un article réservé aux pros", () => {
  it("porte « both » ou « public », et n'a aucun article « pro », dans aucune langue", async () => {
    const both = await anActiveFiche(staff, "Pain de campagne");
    const publicOnly = await anActiveFiche(staff, "Éclair", "public");
    const proOnly = await anActiveFiche(staff, "Pain de mie, carton de 40", "pro");
    await relayAll(ctx);
    await approve([both, publicOnly, proOnly]);

    for (const lang of [undefined, "fr", "en", "it"]) {
      const view = await shop(lang);
      expect(itemOf(view, both)?.audience).toBe("both");
      expect(itemOf(view, publicOnly)?.audience).toBe("public");
      expect(itemOf(view, proOnly)).toBeUndefined();
      expect(view.items.map((item) => item.audience)).not.toContain("pro");
    }
  });
});
