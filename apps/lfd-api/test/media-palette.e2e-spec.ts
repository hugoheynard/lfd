/**
 * E2E de la **palette des images** — la frise des couleurs (plan L9,
 * 2026-10-11).
 *
 * Ce que seul ce niveau prouve : que le champ multipart traverse jusqu'au
 * `jsonb`, que le rattrapage n'écrit que sur `palette IS NULL` contre le vrai
 * Postgres, que le feed la rend, et que le mur `media_library` tient.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token === "staff-e2e" ? E2E_STAFF_SUB : token, scopes: [] }),
};

const MEDIA = "/media";
const PALETTE = "/media/palette";
const SALES = "staff-commercial";

const SENT = [
  { hex: "#AA3300", share: 0.6, outlier: false },
  { hex: "#ffeedd", share: 0.4, outlier: false },
  { hex: "#0044ff", share: 0.03, outlier: true },
];
const STORED = [
  { hex: "#aa3300", share: 0.6, outlier: false },
  { hex: "#ffeedd", share: 0.4, outlier: false },
  { hex: "#0044ff", share: 0.03, outlier: true },
];
const OTHER = [{ hex: "#000000", share: 1, outlier: false }];

interface FeedItem {
  readonly url: string;
  readonly palette: unknown;
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

function png(width: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(600, 20);
  return buffer;
}

async function deposit(width: number, palette?: string): Promise<string> {
  const request = staff().post(MEDIA).attach("file", png(width), "image.png");
  const response = await (palette === undefined ? request : request.field("palette", palette));
  expect(response.status).toBe(201);
  return jsonBody<{ url: string }>(response).url;
}

async function paletteOf(url: string): Promise<unknown> {
  const response = await staff().get(MEDIA).expect(200);
  const item = jsonBody<{ items: readonly FeedItem[] }>(response).items.find(
    (entry) => entry.url === url,
  );
  expect(item).toBeDefined();
  return item?.palette;
}

describe("la palette au dépôt", () => {
  it("range la palette envoyée, et rend null sans palette", async () => {
    const painted = await deposit(1001, JSON.stringify(SENT));
    const blank = await deposit(1002);

    expect(await paletteOf(painted)).toEqual(STORED);
    expect(await paletteOf(blank)).toBeNull();
  });

  it("refuse en 400 une palette illisible ou invalide, sans rien inscrire", async () => {
    for (const palette of [
      "pas du json",
      JSON.stringify([{ hex: "#aaaaaa", share: 0.3, outlier: false }]),
    ]) {
      await staff()
        .post(MEDIA)
        .attach("file", png(1003), "image.png")
        .field("palette", palette)
        .expect(400);
    }
    expect(await ctx.prisma.mediaAsset.count()).toBe(0);
  });

  it("pose la palette au redépôt d'une image qui n'en avait pas, jamais par-dessus", async () => {
    const url = await deposit(1004);
    expect(await deposit(1004, JSON.stringify(SENT))).toBe(url);
    expect(await paletteOf(url)).toEqual(STORED);

    await deposit(1004, JSON.stringify(OTHER));
    expect(await paletteOf(url)).toEqual(STORED);
  });
});

describe("PUT /media/palette — le rattrapage", () => {
  it("pose la palette d'une image qui n'en a pas, puis n'écrase plus", async () => {
    const url = await deposit(1005);

    await staff().put(PALETTE).send({ url, palette: SENT }).expect(204);
    expect(await paletteOf(url)).toEqual(STORED);

    await staff().put(PALETTE).send({ url, palette: OTHER }).expect(204);
    expect(await paletteOf(url)).toEqual(STORED);
  });

  it("rend 404 pour une image inconnue et 400 pour une palette invalide", async () => {
    await staff()
      .put(PALETTE)
      .send({ url: "https://media.example/products/inconnue.png", palette: SENT })
      .expect(404);
    const url = await deposit(1006);
    await staff()
      .put(PALETTE)
      .send({ url, palette: [{ hex: "rouge", share: 1, outlier: false }] })
      .expect(400);
    expect(await paletteOf(url)).toBeNull();
  });

  it("refuse un rôle sans le droit, et un anonyme", async () => {
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
    const url = await deposit(1007);
    const body = { url, palette: SENT };

    await ctx.http().put(PALETTE).set("Authorization", `Bearer ${SALES}`).send(body).expect(403);
    await ctx.http().put(PALETTE).send(body).expect(401);
    expect(await paletteOf(url)).toBeNull();
  });
});
