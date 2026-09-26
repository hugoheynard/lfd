/**
 * E2E de la **vitrine** — plan `documentation/order/plan-vitrine-enregistrement.md`
 * (D2, D3, D6, D7, D8).
 *
 * Ce que seul le vrai Postgres prouve : que le verrou de révision tient contre
 * deux enregistrements RÉELLEMENT concurrents (l'upsert conditionnel, pas une
 * comparaison en mémoire), que les CHECK de la migration refusent ce que le
 * domaine refuse déjà, qu'un objet retiré est archivé et non supprimé, et que
 * la lecture publique ne sert que les objets vivants d'un rayon, dans l'ordre.
 */
import type {
  PublicStorefrontPageView,
  StorefrontPayloadInput,
  StorefrontView,
} from "@lfd/contracts";

import { StorefrontMediaUsage } from "../src/b2b/storefront/channels/media/storefront-media-usage.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

const ADMIN = "/admin/storefront";

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

const CAROUSEL = {
  nav: "dots",
  autoplay: false,
  intervalSeconds: 5,
  firstSeconds: 8,
  sampleCount: 3,
} as const;

type ObjectInput = StorefrontPayloadInput["objects"][number];

/** Un objet valide ; le ton est OMIS, pour éprouver le défaut `light`. */
function object(overrides: Partial<ObjectInput> & Pick<ObjectInput, "shape">): ObjectInput {
  const side = overrides.shape === "card" || overrides.shape === "kakemono" ? "top" : "left";
  return {
    applyOnMobile: true,
    mediaFit: "cover",
    mediaSide: side,
    multiple: false,
    carousel: CAROUSEL,
    column: 1,
    row: 1,
    shelves: ["all"],
    contents: [],
    ...overrides,
  };
}

const PAGES = [
  { shelfKey: "all", rows: 4 },
  { shelfKey: "choco", rows: 3 },
];

function body(
  revision: number,
  objects: readonly ObjectInput[],
  pages = PAGES,
): StorefrontPayloadInput {
  return { revision, pages, objects: [...objects], templates: [] };
}

async function read(): Promise<StorefrontView> {
  return jsonBody<StorefrontView>(await staff().get(ADMIN).expect(200));
}

async function publicPage(shelfKey: string): Promise<PublicStorefrontPageView> {
  return jsonBody<PublicStorefrontPageView>(
    await ctx.http().get(`/shop/storefront/${shelfKey}`).expect(200),
  );
}

function only<T>(items: readonly T[]): T {
  const [first] = items;
  if (first === undefined || items.length !== 1) {
    throw new Error(`un seul élément attendu, ${String(items.length)} reçus`);
  }
  return first;
}

describe("charger et enregistrer", () => {
  it("une vitrine jamais enregistrée se lit en révision 0, vide", async () => {
    expect(await read()).toEqual({
      revision: 0,
      updatedAt: null,
      pages: [],
      objects: [],
      templates: [],
    });
  });

  it("enregistre, identifie l'objet, pose le ton `light` par défaut, et range l'auteur INTERNE", async () => {
    await staff()
      .put(ADMIN)
      .send(body(0, [object({ shape: "band", contents: [{ kind: "product", sku: "CRO-01" }] })]))
      .expect(204);

    const view = await read();
    expect(view.revision).toBe(1);
    const saved = only(view.objects);
    expect(saved).toMatchObject({ shape: "band", tone: "light", shelves: ["all"] });
    expect(saved.id).toMatch(/^[0-9A-Z]{26}$/u);
    const row = await ctx.prisma.storefront.findUniqueOrThrow({ where: { id: "main" } });
    // Régression gardée : l'auteur est la fiche, jamais le `sub` (lint:auth0-id-readers).
    expect(row.updatedByStaffId).toBe(E2E_STAFF_ID);
  });

  it("journalise l'enregistrement, avec son auteur", async () => {
    await staff()
      .put(ADMIN)
      .send(body(0, [object({ shape: "card" })]))
      .expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "storefront.saved" },
      select: { actorId: true, payload: true },
    });
    const fact = only(facts);
    expect(fact.actorId).toBe(E2E_STAFF_ID);
    expect(fact.payload).toMatchObject({ revision: 1, shelves: ["all", "choco"] });
  });

  it("refuse un ton inconnu à la porte (400)", async () => {
    const response = await staff()
      .put(ADMIN)
      .send({ ...body(0, []), objects: [{ ...object({ shape: "card" }), tone: "pink" }] });

    expect(response.status).toBe(400);
  });
});

describe("la collision, sur chaque rayon", () => {
  it("refuse un objet qui en chevauche un autre sur un rayon PARTAGÉ, et n'écrit rien", async () => {
    const easter = object({ shape: "band", shelves: ["all", "choco"] });
    const tile = object({ shape: "tile", column: 2, shelves: ["choco"] });

    const response = await staff()
      .put(ADMIN)
      .send(body(0, [easter, tile]));

    expect(response.status).toBe(400);
    expect(jsonBody<{ message: string }>(response).message).toContain(
      "Sur le rayon « choco », chevauche",
    );
    expect((await read()).revision).toBe(0);
  });

  it("refuse un débordement des rangées d'une page", async () => {
    const response = await staff()
      .put(ADMIN)
      .send(body(0, [object({ shape: "doubleBand", row: 3, shelves: ["choco"] })]));

    expect(response.status).toBe(400);
    expect(jsonBody<{ message: string }>(response).message).toContain("Déborde des 3 rangées");
  });

  it("refuse une page hors bornes et un défilement hors bornes", async () => {
    await staff()
      .put(ADMIN)
      .send(body(0, [], [{ shelfKey: "all", rows: 13 }]))
      .expect(400);
    await staff()
      .put(ADMIN)
      .send(body(0, [object({ shape: "card", carousel: { ...CAROUSEL, intervalSeconds: 2 } })]))
      .expect(400);
  });
});

describe("le verrou de révision", () => {
  it("deux enregistrements CONCURRENTS sur la même révision : un seul passe", async () => {
    await staff().put(ADMIN).send(body(0, [])).expect(204);

    const [first, second] = await Promise.all([
      staff()
        .put(ADMIN)
        .send(body(1, [object({ shape: "card" })])),
      staff()
        .put(ADMIN)
        .send(body(1, [object({ shape: "tile", column: 3 })])),
    ]);

    expect([first.status, second.status].sort()).toEqual([204, 409]);
    const view = await read();
    expect(view.revision).toBe(2);
    expect(view.objects).toHaveLength(1);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "storefront.saved" } })).toBe(2);
  });

  it("deux PREMIERS enregistrements concurrents (aucune ligne encore) : un seul passe", async () => {
    const [first, second] = await Promise.all([
      staff()
        .put(ADMIN)
        .send(body(0, [object({ shape: "card" })])),
      staff()
        .put(ADMIN)
        .send(body(0, [object({ shape: "card", column: 2 })])),
    ]);

    expect([first.status, second.status].sort()).toEqual([204, 409]);
    expect((await read()).revision).toBe(1);
  });

  it("refuse une révision annoncée sur une vitrine jamais enregistrée, et n'insère rien", async () => {
    await staff().put(ADMIN).send(body(5, [])).expect(409);

    expect(await ctx.prisma.storefront.count()).toBe(0);
  });

  it("refuse une révision périmée en disant à quelle heure la vitrine a changé", async () => {
    await staff().put(ADMIN).send(body(0, [])).expect(204);

    const response = await staff().put(ADMIN).send(body(0, []));

    expect(response.status).toBe(409);
    expect(jsonBody<{ message: string }>(response).message).toMatch(
      /^La vitrine a été modifiée à \d{2}:\d{2} pendant que vous travailliez — rechargez/u,
    );
  });
});

describe("archiver plutôt que supprimer", () => {
  it("un objet retiré de la composition est archivé, ses parties gardées", async () => {
    await staff()
      .put(ADMIN)
      .send(body(0, [object({ shape: "card", contents: [{ kind: "product", sku: "CRO-01" }] })]))
      .expect(204);
    const { id } = only((await read()).objects);

    await staff().put(ADMIN).send(body(1, [])).expect(204);

    expect((await read()).objects).toEqual([]);
    const row = await ctx.prisma.storefrontObject.findUniqueOrThrow({
      where: { id },
      include: { shelves: true, contents: true },
    });
    expect(row.archivedAt).not.toBeNull();
    expect(row.shelves.map((shelf) => shelf.shelfKey)).toEqual(["all"]);
    expect(row.contents.map((content) => content.productSku)).toEqual(["CRO-01"]);
    expect((await publicPage("all")).objects).toEqual([]);
  });

  it("refuse de réécrire un objet archivé (409)", async () => {
    await staff()
      .put(ADMIN)
      .send(body(0, [object({ shape: "card" })]))
      .expect(204);
    const { id } = only((await read()).objects);
    await staff().put(ADMIN).send(body(1, [])).expect(204);

    await staff()
      .put(ADMIN)
      .send(body(2, [object({ shape: "card", id })]))
      .expect(409);
  });
});

describe("la lecture publique", () => {
  it("sert les objets VIVANTS d'un rayon, en ordre de lecture, contenus dans l'ordre", async () => {
    const info = (fr: string) => ({
      kind: "info" as const,
      badge: null,
      title: { fr },
      lede: null,
      image: null,
      linkShelfKey: null,
    });
    await staff()
      .put(ADMIN)
      .send(
        body(0, [
          object({ shape: "card", row: 2, column: 1, tone: "dark" }),
          object({
            shape: "band",
            shelves: ["all", "choco"],
            multiple: true,
            contents: [info("Pâques"), { kind: "product", sku: "OEUF-01" }, info("Noël")],
          }),
          object({ shape: "tile", row: 2, column: 3, shelves: ["choco"] }),
        ]),
      )
      .expect(204);

    const all = await publicPage("all");

    expect(all.rows).toBe(4);
    expect(all.objects.map((item) => [item.shape, item.row, item.column])).toEqual([
      ["band", 1, 1],
      ["card", 2, 1],
    ]);
    const band = all.objects[0];
    // Une annonce sans opération se lit avec son action déduite et sans bloc
    // d'opération (lot 5 des opérations datées, champs additifs).
    const served = (fr: string) => ({
      ...info(fr),
      operationKey: null,
      action: "none",
      operation: null,
    });
    expect(band?.contents).toEqual([
      served("Pâques"),
      { kind: "product", sku: "OEUF-01" },
      served("Noël"),
    ]);
    expect(band?.carousel).toEqual({
      nav: "dots",
      autoplay: false,
      intervalSeconds: 5,
      firstSeconds: 8,
    });
    expect(all.objects[1]).toMatchObject({ tone: "dark", carousel: null });
    expect(all.objects[1]).not.toHaveProperty("shelves");
  });

  it("un rayon sans page rend une page vide — la boutique l'affiche en cartes", async () => {
    expect(await publicPage("fam-sans-page")).toEqual({ rows: 0, objects: [] });
  });
});

describe("le canal des images employées (D9)", () => {
  const CROISSANT = "https://media.test/croissant.jpg";
  const PAIN = "https://media.test/pain.jpg";
  const withImage = (fr: string, url: string) => ({
    kind: "info" as const,
    badge: null,
    title: { fr },
    lede: null,
    image: { url, alt: null },
    linkShelfKey: null,
  });

  it("compte les objets VIVANTS qui montrent une image, et les nomme par le titre", async () => {
    await staff()
      .put(ADMIN)
      .send(
        body(0, [
          object({
            shape: "band",
            multiple: true,
            contents: [withImage("Pâques", CROISSANT), withImage("Encore", CROISSANT)],
          }),
          object({ shape: "card", row: 2, contents: [withImage("Pain", PAIN)] }),
          object({
            shape: "card",
            row: 2,
            column: 2,
            contents: [withImage("Viennoiserie", CROISSANT)],
          }),
        ]),
      )
      .expect(204);
    const usage = ctx.app.get(StorefrontMediaUsage);

    const uses = await usage.usesOf([CROISSANT, PAIN, "https://media.test/orpheline.jpg"]);

    // Un objet qui montre deux fois la même image compte UNE fois.
    expect(Object.fromEntries(uses)).toEqual({ [CROISSANT]: 2, [PAIN]: 1 });
    expect((await usage.usagesOf(CROISSANT)).map((entry) => entry.label).sort()).toEqual([
      "Pâques",
      "Viennoiserie",
    ]);
    expect(await usage.usagesOf("https://media.test/orpheline.jpg")).toEqual([]);
  });

  it("ne compte pas une image posée sur un objet ARCHIVÉ", async () => {
    await staff()
      .put(ADMIN)
      .send(body(0, [object({ shape: "card", contents: [withImage("Pain", PAIN)] })]))
      .expect(204);
    await staff().put(ADMIN).send(body(1, [])).expect(204);
    const usage = ctx.app.get(StorefrontMediaUsage);

    expect((await usage.usesOf([PAIN])).size).toBe(0);
    expect(await usage.usagesOf(PAIN)).toEqual([]);
  });
});

describe("les CHECK de la migration — la base refuse ce que le domaine refuse", () => {
  // Écritures SQL directes, et c'est l'objet : éprouver la dernière ligne de
  // défense, celle qui tient même contre un code qui aurait contourné l'agrégat.
  const refuses = async (sql: string): Promise<void> => {
    await expect(ctx.prisma.$executeRawUnsafe(sql)).rejects.toThrow(/check constraint/iu);
  };
  const objectRow = (id: string, extra: Record<string, string> = {}): string => {
    const columns: Record<string, string> = {
      id: `'${id}'`,
      shape: "'card'",
      col: "1",
      row: "1",
      apply_on_mobile: "true",
      media_fit: "'cover'",
      media_side: "'top'",
      multiple: "false",
      nav: "'dots'",
      autoplay: "false",
      interval_s: "5",
      first_s: "8",
      sample_count: "3",
      ...extra,
    };
    const names = Object.keys(columns).map((name) => `"${name}"`);
    return `INSERT INTO "public"."storefront_object" (${names.join(", ")}) VALUES (${Object.values(columns).join(", ")})`;
  };

  it("bornes des pages, des objets, du défilement et du ton", async () => {
    await refuses(
      `INSERT INTO "public"."storefront_page" ("shelf_key", "rows") VALUES ('all', 13)`,
    );
    await refuses(objectRow("o1", { col: "6" }));
    await refuses(objectRow("o2", { row: "0" }));
    await refuses(objectRow("o3", { interval_s: "2" }));
    await refuses(objectRow("o4", { first_s: "31" }));
    await refuses(objectRow("o5", { sample_count: "7" }));
    await refuses(objectRow("o6", { tone: "'pink'" }));
    await refuses(objectRow("o7", { shape: "'triangle'" }));
  });

  it("le ton vaut `light` quand on ne le dit pas", async () => {
    await ctx.prisma.$executeRawUnsafe(objectRow("ok"));
    const row = await ctx.prisma.storefrontObject.findUniqueOrThrow({ where: { id: "ok" } });
    expect(row.tone).toBe("light");
  });

  it("un produit porte un SKU et rien d'autre ; une info porte un titre objet", async () => {
    await ctx.prisma.$executeRawUnsafe(objectRow("host"));
    const content = (id: string, columns: string, values: string): string =>
      `INSERT INTO "public"."storefront_content" ("id", "object_id", "position", ${columns}) VALUES ('${id}', 'host', ${id.slice(1)}, ${values})`;

    await refuses(content("c1", `"kind"`, `'product'`));
    await refuses(
      content("c2", `"kind", "product_sku", "title"`, `'info', 'CRO-01', '{"fr":"x"}'`),
    );
    await refuses(content("c3", `"kind"`, `'info'`));
    await refuses(content("c4", `"kind", "title"`, `'info', '["x"]'`));
    await refuses(
      content("c5", `"kind", "product_sku", "lede"`, `'product', 'CRO-01', '{"fr":"x"}'`),
    );
    await refuses(
      content("c6", `"kind", "title", "image_alt"`, `'info', '{"fr":"x"}', '{"fr":"y"}'`),
    );
  });

  it("une seule vitrine, en révision 1 au moins", async () => {
    await refuses(
      `INSERT INTO "public"."storefront" ("id", "revision", "updated_at", "updated_by_staff_id") VALUES ('autre', 1, now(), 'x')`,
    );
    await refuses(
      `INSERT INTO "public"."storefront" ("id", "revision", "updated_at", "updated_by_staff_id") VALUES ('main', 0, now(), 'x')`,
    );
  });
});

describe("le mur : `b2b_storefront`, à admin et communication seulement", () => {
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

  it("la communication lit ET enregistre la vitrine", async () => {
    const sub = await person("communication");

    await ctx.asSub(sub).get(ADMIN).expect(200);
    await ctx
      .asSub(sub)
      .put(ADMIN)
      .send(body(0, [object({ shape: "card" })]))
      .expect(204);
    const row = await ctx.prisma.storefront.findUniqueOrThrow({ where: { id: "main" } });
    expect(row.updatedByStaffId).toBe("fiche-communication");
  });

  it("le commercial ne la voit pas", async () => {
    const sub = await person("commercial");

    await ctx.asSub(sub).get(ADMIN).expect(403);
    await ctx.asSub(sub).put(ADMIN).send(body(0, [])).expect(403);
  });

  it("la lecture publique ne demande personne", async () => {
    await ctx.http().get("/shop/storefront/all").expect(200);
    await ctx.http().get(ADMIN).expect(401);
  });
});
