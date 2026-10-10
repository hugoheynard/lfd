/**
 * E2E du **feed de la médiathèque** — curseur, ordres, filtres (plan L2,
 * 2026-10-10).
 *
 * Ce que seul ce niveau prouve : que le keyset écrit en Prisma rend, contre le
 * vrai Postgres, des pages sans doublon ni saut quand une image arrive entre
 * deux lectures ; que l'ordre « emplois » et le filtre « inutilisées » lisent
 * les vrais porteurs par le canal ; et que le mur `media_library` tient.
 */
import { instantToLocal } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";

/** Même doublé que `pim-media-library` : il HONORE le jeton (le jeton EST le sujet). */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token === "staff-e2e" ? E2E_STAFF_SUB : token, scopes: [] }),
};

const MEDIA = "/media";
const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";

interface FeedPage {
  readonly items: readonly { readonly url: string; readonly uses: number }[];
  readonly total: number;
  readonly next: string | null;
}

let ctx: E2eContext;
let width = 1000;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MediaStore, value: new InMemoryMediaStore() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

/** Un PNG minimal et valide ; une largeur neuve à chaque appel fait une image neuve. */
function png(): Buffer {
  width += 1;
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(600, 20);
  return buffer;
}

interface ImageSpec {
  readonly name?: string;
  readonly tags?: readonly string[];
  /** Il y a combien de jours elle est entrée au fonds. */
  readonly daysOld?: number;
}

/**
 * Dépose par la vraie route, décrit par la vraie route, puis recule l'instant
 * de dépôt.
 *
 * ⚠️ Ce dernier geste écrit en Prisma, et c'est le seul : l'instant d'entrée
 * au fonds n'est posé par aucun geste — c'est l'horloge du dépôt —, et un test
 * d'ordre ou de période sans instants distincts ne prouverait rien.
 */
async function image(spec: ImageSpec = {}): Promise<string> {
  const deposited = await staff().post(MEDIA).attach("file", png(), "image.png");
  expect(deposited.status).toBe(201);
  const url = jsonBody<{ url: string }>(deposited).url;
  if (spec.name !== undefined || spec.tags !== undefined) {
    const described = await staff()
      .put(MEDIA)
      .send({ url, name: spec.name ?? "", tags: spec.tags ?? [], focal: null });
    expect(described.status).toBe(200);
  }
  if (spec.daysOld !== undefined) {
    await ctx.prisma.mediaAsset.update({
      where: { url },
      data: { createdAt: new Date(daysAgo(spec.daysOld)) },
    });
  }
  return url;
}

/** Une fiche qui affiche ces images : un porteur de plus pour chacune. */
async function carriedBy(urls: readonly string[], label: string): Promise<void> {
  const category = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Famille ${label}` } });
  expect(category.status).toBe(201);
  const product = await staff()
    .post(PRODUCTS)
    .send({
      name: { fr: label },
      kind: "daily",
      categoryId: jsonBody<{ id: string }>(category).id,
    });
  expect(product.status).toBe(201);
  const media = urls.map((url, index) => ({ role: index === 0 ? "hero" : "gallery", url }));
  const set = await staff()
    .put(`${PRODUCTS}/${jsonBody<{ id: string }>(product).id}/media`)
    .send({ media });
  expect(set.status).toBe(200);
}

async function feed(query: Record<string, string | number>): Promise<FeedPage> {
  const response = await staff().get(MEDIA).query(query);
  expect(response.status).toBe(200);
  return jsonBody<FeedPage>(response);
}

/** Toutes les pages, curseur après curseur. */
async function everyPage(query: Record<string, string | number>): Promise<readonly string[]> {
  const seen: string[] = [];
  let next: string | null = null;
  do {
    const page: FeedPage = await feed(next === null ? query : { ...query, after: next });
    seen.push(...page.items.map((item) => item.url));
    next = page.next;
  } while (next !== null);
  return seen;
}

const urlsOf = (page: FeedPage): readonly string[] => page.items.map((item) => item.url);

describe("GET /media — le curseur", () => {
  it("ne double ni ne saute rien quand une image est déposée entre deux pages", async () => {
    // Régression visée (plan L2) : par décalage, un dépôt pendant qu'on défile
    // décalait tout d'un rang, et « charger plus » rendait une image deux fois.
    const fonds = [];
    for (const days of [1, 2, 3, 4, 5]) {
      fonds.push(await image({ daysOld: days }));
    }

    const first = await feed({ limit: 2 });
    expect(urlsOf(first)).toEqual(fonds.slice(0, 2));
    expect(first.next).not.toBeNull();

    await image();
    const second = await feed({ limit: 2, after: first.next ?? "" });
    const third = await feed({ limit: 2, after: second.next ?? "" });

    expect(urlsOf(second)).toEqual(fonds.slice(2, 4));
    expect(urlsOf(third)).toEqual(fonds.slice(4));
    expect(third.next).toBeNull();
    expect(second.total).toBe(6);
  });

  it("sert encore l'ancien décalage, et rend déjà `next`", async () => {
    const fonds = [await image({ daysOld: 1 }), await image({ daysOld: 2 })];

    const page = await feed({ limit: 1, offset: 1 });

    expect(urlsOf(page)).toEqual([fonds[1]]);
    expect(page.next).toBeNull();
  });

  it("refuse en 400 un curseur illisible, en le nommant", async () => {
    const response = await staff().get(MEDIA).query({ after: "pas-un-curseur" });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain("Curseur de la médiathèque illisible");
  });

  it("refuse en 400 un curseur émis pour un autre ordre", async () => {
    await image({ daysOld: 1 });
    await image({ daysOld: 2 });
    const byDeposit = await feed({ limit: 1 });

    const response = await staff()
      .get(MEDIA)
      .query({ sort: "name", after: byDeposit.next ?? "" });

    expect(response.status).toBe(400);
  });

  it("refuse en 400 un ordre inconnu et un jour mal formé", async () => {
    // `shot` servait d'ordre inconnu jusqu'à L3 (2026-10-10), qui l'a rendu réel.
    expect((await staff().get(MEDIA).query({ sort: "colour" })).status).toBe(400);
    expect((await staff().get(MEDIA).query({ from: "hier" })).status).toBe(400);
  });
});

describe("GET /media — les ordres", () => {
  it("par étiquette, alphabétique, les images sans étiquette en dernier", async () => {
    const tourte = await image({ name: "tourte" });
    const unnamed = [await image(), await image()].sort();
    const brioche = await image({ name: "brioche" });

    expect(await everyPage({ sort: "name", limit: 1 })).toEqual([brioche, tourte, ...unnamed]);
  });

  it("par emplois, le plus employé d'abord, en lisant les porteurs", async () => {
    const twice = await image();
    const once = await image();
    const never = await image();
    await carriedBy([twice, once], "Croissant");
    await carriedBy([twice], "Tourte");

    const pages = await everyPage({ sort: "uses", limit: 1 });

    expect(pages).toEqual([twice, once, never]);
    expect((await feed({ sort: "uses" })).items.map((item) => item.uses)).toEqual([2, 1, 0]);
  });
});

describe("GET /media — les filtres", () => {
  it("« non taguées » ne garde que les images sans mot-clé", async () => {
    await image({ tags: ["croissant"] });
    const bare = await image();

    const page = await feed({ untagged: 1 });

    expect(urlsOf(page)).toEqual([bare]);
    expect(page.total).toBe(1);
  });

  it("« inutilisées » ne garde que les images sans porteur, total compris", async () => {
    const carried = await image({ daysOld: 1 });
    const idle = [await image({ daysOld: 2 }), await image({ daysOld: 3 })];
    await carriedBy([carried], "Croissant");

    const first = await feed({ unused: 1, limit: 1 });

    expect(first.total).toBe(2);
    expect(urlsOf(first)).toEqual([idle[0]]);
    expect(await everyPage({ unused: 1, limit: 1 })).toEqual(idle);
  });

  it("la période retient les jours de dépôt à l'heure de Paris, bornes incluses", async () => {
    await image({ daysOld: 30 });
    const inside = await image({ daysOld: 5 });
    await image();

    const from = instantToLocal(new Date(daysAgo(8))).day;
    const to = instantToLocal(new Date(daysAgo(5))).day;
    const page = await feed({ from, to });

    expect(urlsOf(page)).toEqual([inside]);
    expect(page.total).toBe(1);
  });

  it("cumule les filtres : mot-clé, inutilisée, texte, ordre par étiquette", async () => {
    const wanted = await image({ name: "croissant doré", tags: ["matin"] });
    const carried = await image({ name: "croissant nature", tags: ["matin"] });
    await image({ name: "croissant sans mot" });
    await image({ name: "tourte", tags: ["matin"] });
    await carriedBy([carried], "Croissant");

    const page = await feed({ q: "croiss", tags: "matin", unused: 1, sort: "name" });

    expect(urlsOf(page)).toEqual([wanted]);
    expect(page.total).toBe(1);
    expect(page.next).toBeNull();
  });
});

/** Le mur : `media_library:read` pour lire le fonds, quel que soit l'ordre. */
describe("le mur du feed", () => {
  const SALES = "staff-commercial";

  beforeEach(async () => {
    await ctx.prisma.staffUser.create({
      data: {
        id: "fiche-commercial",
        firstName: "Fiche",
        lastName: "commercial",
        email: "commercial@lfc.test",
        role: "commercial",
        status: "active",
        auth0Id: SALES,
      },
    });
  });

  it("refuse le feed à un rôle sans le droit, même filtré", async () => {
    const response = await ctx
      .http()
      .get(MEDIA)
      .set("Authorization", `Bearer ${SALES}`)
      .query({ sort: "uses", unused: 1 });

    expect(response.status).toBe(403);
  });

  it("refuse un anonyme", async () => {
    expect((await ctx.http().get(MEDIA)).status).toBe(401);
  });
});
