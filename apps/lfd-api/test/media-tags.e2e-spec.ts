/**
 * E2E du **vocabulaire de la médiathèque** — compter, renommer, fusionner,
 * retirer un mot-clé dans tout le fonds (plan L1, 2026-10-10).
 *
 * Ce que seul ce niveau prouve : que le compte porte sur TOUT le fonds et pas
 * sur une page, que le renommage réécrit les vraies lignes dans une seule
 * transaction avec son fait, et que le mur `media_library` refuse le geste à
 * qui n'a pas le droit.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";

/** Même doublé que `pim-media-library` : il HONORE le jeton (le jeton EST le sujet). */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token === "staff-e2e" ? E2E_STAFF_SUB : token, scopes: [] }),
};

const MEDIA = "/media";
const TAGS = "/media/tags";

interface TagCount {
  readonly tag: string;
  readonly count: number;
}

let ctx: E2eContext;

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

/** Un PNG minimal et valide ; deux tailles distinctes font deux images. */
function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

/** Dépose une image et lui pose ses mots-clés, par les vraies routes. */
async function taggedImage(width: number, tags: readonly string[]): Promise<string> {
  const deposited = await staff().post(MEDIA).attach("file", png(width, 600), "image.png");
  expect(deposited.status).toBe(201);
  const url = jsonBody<{ url: string }>(deposited).url;
  const described = await staff().put(MEDIA).send({ url, name: "", tags, focal: null });
  expect(described.status).toBe(200);
  return url;
}

async function vocabulary(): Promise<readonly TagCount[]> {
  const response = await staff().get(TAGS);
  expect(response.status).toBe(200);
  return jsonBody<readonly TagCount[]>(response);
}

async function tagsOf(url: string): Promise<readonly string[]> {
  const row = await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { url } });
  return row.tags;
}

async function facts(type: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { type },
    select: { subjectType: true, subjectId: true, payload: true },
  });
}

describe("GET /media/tags — le vocabulaire", () => {
  it("compte sur TOUT le fonds, y compris hors de la page chargée", async () => {
    // Régression visée (plan L1) : la bande dérivait ses mots des images
    // chargées — un mot porté hors de la page n'y figurait pas.
    await taggedImage(1001, ["croissant", "beurre"]);
    await taggedImage(1002, ["croissant"]);
    await taggedImage(1003, ["baguette"]);

    const page = await staff().get(MEDIA).query({ limit: 1 });
    expect(jsonBody<{ items: unknown[] }>(page).items).toHaveLength(1);

    expect(await vocabulary()).toEqual([
      { tag: "croissant", count: 2 },
      { tag: "baguette", count: 1 },
      { tag: "beurre", count: 1 },
    ]);
  });

  it("rend une liste vide sur un fonds sans mot", async () => {
    expect(await vocabulary()).toEqual([]);
  });
});

describe("PUT /media/tags/rename", () => {
  it("renomme partout, normalisé, et trace UN fait pour le geste", async () => {
    const a = await taggedImage(1001, ["croissant", "beurre"]);
    const b = await taggedImage(1002, ["croissant"]);

    const response = await staff().put(`${TAGS}/rename`).send({ from: "croissant", to: "  Doré " });

    expect(response.status).toBe(204);
    expect(await tagsOf(a)).toEqual(["doré", "beurre"]);
    expect(await tagsOf(b)).toEqual(["doré"]);
    const renamed = await facts("media_tag.renamed");
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toMatchObject({
      subjectType: "media_tag",
      subjectId: "croissant",
      payload: {
        subjectLabel: "croissant",
        from: "croissant",
        to: "doré",
        images: 2,
        merged: false,
      },
    });
  });

  it("fusionne quand le nouveau mot est déjà sur l'image, sans doublon", async () => {
    const a = await taggedImage(1001, ["croissant", "doré"]);
    await taggedImage(1002, ["croissant"]);

    const response = await staff().put(`${TAGS}/rename`).send({ from: "croissant", to: "doré" });

    expect(response.status).toBe(204);
    expect(await tagsOf(a)).toEqual(["doré"]);
    expect(await vocabulary()).toEqual([{ tag: "doré", count: 2 }]);
    const [fact] = await facts("media_tag.renamed");
    expect(fact?.payload).toMatchObject({ merged: true, images: 2 });
  });

  it("refuse en 400 un nouveau mot vide une fois normalisé", async () => {
    await taggedImage(1001, ["croissant"]);

    const response = await staff().put(`${TAGS}/rename`).send({ from: "croissant", to: "   " });

    expect(response.status).toBe(400);
  });

  it("refuse en 400 un nouveau mot identique à l'ancien", async () => {
    await taggedImage(1001, ["croissant"]);

    const response = await staff()
      .put(`${TAGS}/rename`)
      .send({ from: "croissant", to: "CROISSANT" });

    expect(response.status).toBe(400);
    expect(await facts("media_tag.renamed")).toEqual([]);
  });

  it("rend 404 quand aucune image ne porte le mot", async () => {
    await taggedImage(1001, ["baguette"]);

    const response = await staff().put(`${TAGS}/rename`).send({ from: "croissant", to: "x" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /media/tags", () => {
  it("retire le mot de toutes les images, et trace un fait", async () => {
    const a = await taggedImage(1001, ["croissant", "beurre"]);
    const b = await taggedImage(1002, ["croissant"]);

    const response = await staff().delete(TAGS).query({ tag: "croissant" });

    expect(response.status).toBe(204);
    expect(await tagsOf(a)).toEqual(["beurre"]);
    expect(await tagsOf(b)).toEqual([]);
    const [fact] = await facts("media_tag.removed");
    expect(fact).toMatchObject({
      subjectType: "media_tag",
      subjectId: "croissant",
      payload: { subjectLabel: "croissant", tag: "croissant", images: 2 },
    });
  });

  it("rend 404 quand personne ne porte le mot", async () => {
    const response = await staff().delete(TAGS).query({ tag: "croissant" });

    expect(response.status).toBe(404);
  });
});

/** Le mur : `media_library:read` pour lire, `:write` pour les deux gestes. */
describe("le mur du vocabulaire", () => {
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

  const sales = (): ReturnType<E2eContext["http"]> =>
    ctx.http().set("Authorization", `Bearer ${SALES}`);

  it("refuse la lecture du vocabulaire à un rôle sans le droit", async () => {
    expect((await sales().get(TAGS)).status).toBe(403);
  });

  it("refuse le renommage et le retrait à un rôle sans le droit", async () => {
    await taggedImage(1001, ["croissant"]);

    const rename = await sales().put(`${TAGS}/rename`).send({ from: "croissant", to: "baguette" });
    const remove = await sales().delete(TAGS).query({ tag: "croissant" });

    expect(rename.status).toBe(403);
    expect(remove.status).toBe(403);
  });

  it("refuse un anonyme", async () => {
    expect((await ctx.http().get(TAGS)).status).toBe(401);
  });
});
