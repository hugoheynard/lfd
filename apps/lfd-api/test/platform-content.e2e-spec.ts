/**
 * E2E du **contenu de plateforme** — sur un vrai Postgres.
 *
 * Trois choses que seul ce niveau prouve :
 *
 * 1. la lecture publique aboutit **sans aucune ligne en base** — c'est la
 *    garantie qui fait qu'il n'existe pas de fenêtre où la vitrine s'affiche
 *    vide, et elle ne se teste qu'ici, sur une base réellement vierge ;
 * 2. la colonne JSONB fait l'aller-retour sans perdre une langue ni un accent ;
 * 3. le refus du schéma traverse le pipe Zod et le filtre d'erreurs pour
 *    ressortir en `400`, pas en `500`.
 */
import { DEFAULT_FOOTER_CONTENT, type FooterContent, type FooterContentView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
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
  await ctx.prisma.platformContent.deleteMany();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Une variante du contenu de départ, avec un mot reconnaissable par langue. */
function edited(): FooterContent {
  return {
    ...DEFAULT_FOOTER_CONTENT,
    identity: { ...DEFAULT_FOOTER_CONTENT.identity, siret: "812 456 789 00021" },
    fr: {
      ...DEFAULT_FOOTER_CONTENT.fr,
      brand: { ...DEFAULT_FOOTER_CONTENT.fr.brand, tagline: "Boulangerie d’altitude — édité" },
    },
    it: {
      ...DEFAULT_FOOTER_CONTENT.it,
      brand: { ...DEFAULT_FOOTER_CONTENT.it.brand, tagline: "Panificio — modificato" },
    },
  };
}

describe("la lecture publique du pied de page", () => {
  it("aboutit sur une base VIERGE, avec le contenu de départ", async () => {
    // La garantie qui fait qu'aucune fenêtre n'existe où la vitrine est vide.
    const response = await ctx.http().get("/content/footer").expect(200);
    const view = jsonBody<FooterContentView>(response);

    expect(view.revision).toBe(0);
    expect(view.updatedBy).toBeNull();
    expect(view.content.fr.brand.tagline).toBe(DEFAULT_FOOTER_CONTENT.fr.brand.tagline);
    expect(view.content.en.order.links.length).toBeGreaterThan(0);
  });

  it("n'exige aucune authentification — la vitrine se rend avant toute connexion", async () => {
    await ctx.http().get("/content/footer").expect(200);
  });
});

describe("l'écriture staff", () => {
  it("refuse un anonyme", async () => {
    await ctx.http().put("/admin/content/footer").send(edited()).expect(401);
  });

  it("enregistre, puis ressort le MÊME texte par la surface publique", async () => {
    const saved = jsonBody<FooterContentView>(
      await staff().put("/admin/content/footer").send(edited()).expect(200),
    );
    expect(saved.revision).toBe(1);
    expect(saved.updatedBy).not.toBeNull();

    // L'aller-retour JSONB : les trois langues, les accents, et l'identité.
    const view = jsonBody<FooterContentView>(await ctx.http().get("/content/footer").expect(200));
    expect(view.content.fr.brand.tagline).toBe("Boulangerie d’altitude — édité");
    expect(view.content.it.brand.tagline).toBe("Panificio — modificato");
    expect(view.content.en.brand.tagline).toBe(DEFAULT_FOOTER_CONTENT.en.brand.tagline);
    expect(view.content.identity.siret).toBe("812 456 789 00021");
    expect(view.revision).toBe(1);
  });

  it("fait monter la révision à chaque geste, même à texte identique", async () => {
    await staff().put("/admin/content/footer").send(edited()).expect(200);
    const second = jsonBody<FooterContentView>(
      await staff().put("/admin/content/footer").send(edited()).expect(200),
    );
    expect(second.revision).toBe(2);
  });

  it("refuse en 400 un contenu à qui il manque une langue", async () => {
    // Le refus doit traverser le pipe Zod et le filtre d'erreurs : un 500 ici
    // voudrait dire que la validation a lâché plus loin que prévu.
    const withoutItalian: Record<string, unknown> = { ...edited() };
    delete withoutItalian["it"];
    await staff().put("/admin/content/footer").send(withoutItalian).expect(400);
  });

  it("refuse en 400 un SIRET qui n'en est pas un", async () => {
    const wrong = { ...edited(), identity: { ...edited().identity, siret: "812" } };
    await staff().put("/admin/content/footer").send(wrong).expect(400);
  });

  it("refuse en 400 une colonne vidée de ses liens", async () => {
    const empty = edited();
    const wrong = { ...empty, fr: { ...empty.fr, order: { head: "Commander", links: [] } } };
    await staff().put("/admin/content/footer").send(wrong).expect(400);
  });
});
