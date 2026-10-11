/**
 * E2E des **textes de la boutique** (plan
 * `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, lot T1) :
 * lecture publique sans jeton et sans base à chaud, étiquette et `304`, mur
 * `b2b_storefront`, brouillon à révision (409), « Publier » en une
 * transaction avec un fait avant/après.
 */
import type { ActivityPageView, PublishedShopCopyView, ShopCopyAdminView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { SchemaOpsCounter } from "../src/platform/database/schema-ops.counter.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

/** Le jeton porteur EST le `sub` — le mur se joue en base, comme en production. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Deux clés réelles du dictionnaire général : une sans variable, une avec. */
const CART_WHO = "cart.whoTitle";
const ADMIN = "/admin/shop-copy";

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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

async function draft(
  key: string,
  text: string,
  expectedRevision = 0,
  locale = "fr",
): Promise<void> {
  await staff().put(`${ADMIN}/drafts`).send({ key, locale, text, expectedRevision }).expect(204);
}

async function publicCopy(locale = "fr"): Promise<PublishedShopCopyView> {
  return jsonBody<PublishedShopCopyView>(
    await ctx.http().get(`/shop/copy?locale=${locale}`).expect(200),
  );
}

describe("la lecture publique", () => {
  it("se lit sans jeton : version 0, aucun remplacement, en-têtes de cache", async () => {
    const response = await ctx.http().get("/shop/copy?locale=fr").expect(200);
    expect(response.body).toEqual({ locale: "fr", version: 0, texts: {} });
    expect(response.headers["etag"]).toBe('"shop-copy-v0-fr"');
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=60, stale-while-revalidate=600",
    );
  });

  it("refuse une langue inconnue", async () => {
    await ctx.http().get("/shop/copy?locale=de").expect(400);
  });

  it("rend 304, sans corps, à qui a déjà la version", async () => {
    const response = await ctx
      .http()
      .get("/shop/copy?locale=fr")
      .set("If-None-Match", '"shop-copy-v0-fr"')
      .expect(304);
    expect(response.text).toBe("");
  });

  it("à chaud, une seconde lecture ne touche pas la base", async () => {
    const counter = ctx.app.get(SchemaOpsCounter);
    const before = counter.total();
    await publicCopy();
    const cold = counter.total() - before;
    await publicCopy();
    const warm = counter.total() - before - cold;

    expect(cold).toBe(2);
    expect(warm).toBe(0);
  });
});

describe("brouillon, puis « Publier »", () => {
  it("un brouillon ne change pas la boutique ; « Publier » la change, avec une nouvelle version", async () => {
    await publicCopy();
    await draft(CART_WHO, "Pour qui est cette commande ?");
    expect((await publicCopy()).texts).toEqual({});

    const published = await staff().post(`${ADMIN}/publications`).expect(201);
    expect(published.body).toEqual({ version: 1 });

    const view = await publicCopy();
    expect(view).toEqual({
      locale: "fr",
      version: 1,
      texts: { [CART_WHO]: "Pour qui est cette commande ?" },
    });
    expect((await publicCopy("en")).texts).toEqual({});
    // L'ancienne étiquette ne vaut plus : la boutique reçoit le corps neuf.
    await ctx
      .http()
      .get("/shop/copy?locale=fr")
      .set("If-None-Match", '"shop-copy-v0-fr"')
      .expect(200);
  });

  it("le fait au journal porte chaque texte avant et après, et l'historique le relit", async () => {
    await draft(CART_WHO, "Pour qui ?");
    await staff().post(`${ADMIN}/publications`).expect(201);
    await staff()
      .post(`${ADMIN}/resets`)
      .send({ key: CART_WHO, locale: "fr", expectedRevision: 1 })
      .expect(204);
    await staff().post(`${ADMIN}/publications`).expect(201);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "shop_copy.published" },
      orderBy: { id: "asc" },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([
      {
        subjectLabel: "Textes de la boutique",
        version: 1,
        changes: [{ key: CART_WHO, locale: "fr", before: null, after: "Pour qui ?" }],
      },
      {
        subjectLabel: "Textes de la boutique",
        version: 2,
        changes: [{ key: CART_WHO, locale: "fr", before: "Pour qui ?", after: null }],
      },
    ]);
    expect(facts[0]?.actorId).toBe(E2E_STAFF_ID);
    expect((await publicCopy()).texts).toEqual({});

    const history = jsonBody<ActivityPageView>(
      await staff().get(`${ADMIN}/publications`).expect(200),
    );
    expect(history.total).toBe(2);
  });

  it("deux publications simultanées : une seule passe, un seul fait, une seule version", async () => {
    await draft(CART_WHO, "Pour qui ?");
    const [first, second] = await Promise.all([
      staff().post(`${ADMIN}/publications`),
      staff().post(`${ADMIN}/publications`),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "shop_copy.published" } })).toBe(
      1,
    );
    const row = await ctx.prisma.shopCopyPublication.findUniqueOrThrow({ where: { key: "shop" } });
    expect(row.version).toBe(1);
  });

  it("refuse en 409 de publier sans brouillon, sans rien écrire", async () => {
    await staff().post(`${ADMIN}/publications`).expect(409);
    expect(await ctx.prisma.shopCopyPublication.count()).toBe(0);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "shop_copy.published" } })).toBe(
      0,
    );
  });
});

describe("les garde-fous et le verrou", () => {
  it("409 quand quelqu'un a écrit le texte entre-temps", async () => {
    await draft(CART_WHO, "Pour qui ?");
    const response = await staff()
      .put(`${ADMIN}/drafts`)
      .send({ key: CART_WHO, locale: "fr", text: "Autre", expectedRevision: 0 })
      .expect(409);
    expect(jsonBody<{ readonly message: string }>(response).message).toContain(
      "modifié par quelqu'un d'autre",
    );
  });

  it("refuse une clé inconnue (404) et une variable perdue (400)", async () => {
    await staff()
      .put(`${ADMIN}/drafts`)
      .send({ key: "pas.une.cle", locale: "fr", text: "x", expectedRevision: 0 })
      .expect(404);
    await staff()
      .put(`${ADMIN}/drafts`)
      .send({
        key: "accueilPublic.hello.title",
        locale: "fr",
        text: "Bonjour.",
        expectedRevision: 0,
      })
      .expect(400);
  });

  it("la base refuse un texte de brouillon hors de l'état `set`", async () => {
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "public"."shop_copy_entries" ("key", "locale", "revision", "draft_state", "draft_text") VALUES ('k', 'fr', 1, 'reset', 'x')`,
      ),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "public"."shop_copy_entries" ("key", "locale", "revision") VALUES ('k', 'de', 1)`,
      ),
    ).rejects.toThrow();
  });
});

describe("l'écran d'édition", () => {
  it("liste le manifeste, le brouillon, le publié et les orphelines", async () => {
    await draft(CART_WHO, "Pour qui ?");
    await ctx.prisma.shopCopyEntry.create({
      data: { key: "retire.du.code", locale: "fr", revision: 1, publishedText: "ancien" },
    });

    const view = jsonBody<ShopCopyAdminView>(await staff().get(ADMIN).expect(200));
    const entry = view.entries.find((candidate) => candidate.key === CART_WHO);
    expect(entry?.locales.fr).toMatchObject({
      draftState: "set",
      draftText: "Pour qui ?",
      revision: 1,
    });
    expect(entry?.staleTranslations).toEqual(["en", "it"]);
    expect(view.pendingCount).toBe(1);
    expect(view.orphans.map((orphan) => orphan.key)).toEqual(["retire.du.code"]);
    expect(view.entries.length).toBeGreaterThan(1000);
  });
});

describe("le mur : `b2b_storefront`", () => {
  async function person(role: "communication" | "commercial"): Promise<string> {
    const sub = `staff-${role}`;
    await ctx.prisma.staffUser.create({
      data: {
        id: `fiche-${role}`,
        firstName: "Fiche",
        lastName: role,
        email: `${role}@lfc.test`,
        role,
        status: "active",
        auth0Id: sub,
      },
    });
    return sub;
  }

  it("la communication lit, écrit et publie", async () => {
    const sub = await person("communication");
    await ctx.asSub(sub).get(ADMIN).expect(200);
    await ctx
      .asSub(sub)
      .put(`${ADMIN}/drafts`)
      .send({ key: CART_WHO, locale: "fr", text: "Pour qui ?", expectedRevision: 0 })
      .expect(204);
    await ctx.asSub(sub).post(`${ADMIN}/publications`).expect(201);
  });

  it("le commercial ne voit rien", async () => {
    const sub = await person("commercial");
    await ctx.asSub(sub).get(ADMIN).expect(403);
    await ctx
      .asSub(sub)
      .put(`${ADMIN}/drafts`)
      .send({ key: CART_WHO, locale: "fr", text: "x", expectedRevision: 0 })
      .expect(403);
    await ctx.asSub(sub).post(`${ADMIN}/publications`).expect(403);
  });

  it("sans jeton, l'admin répond 401 et la lecture publique 200", async () => {
    await ctx.http().get(ADMIN).expect(401);
    await ctx.http().get("/shop/copy?locale=it").expect(200);
  });
});
