/**
 * E2E de **`GET /media/one?url=`** — une image seule, par son URL.
 *
 * Ouverte le 2026-10-11 pour les outils agent du back-office : `PUT /media`
 * remplace tout, donc qui écrit relit d'abord, et le fil ne filtre pas par URL.
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

/** Un PNG minimal et valide. */
function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
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

describe("GET /media/one", () => {
  it("rend l'image décrite, sous la même forme qu'une ligne du fil", async () => {
    const deposited = await staff().post(MEDIA).attach("file", png(1280, 960), "image.png");
    const { url } = jsonBody<{ url: string }>(deposited);
    await staff()
      .put(MEDIA)
      .send({ url, name: "Croissant", alt: { fr: "Un croissant" }, tags: ["four"], focal: null })
      .expect(200);

    const one = await staff().get(`${MEDIA}/one`).query({ url });
    const feed = await staff().get(MEDIA);

    expect(one.status).toBe(200);
    expect(jsonBody<Record<string, unknown>>(one)).toMatchObject({
      url,
      name: "Croissant",
      tags: ["four"],
      width: 1280,
    });
    expect(jsonBody<Record<string, unknown>>(one)).not.toHaveProperty("storageKey");
    expect(jsonBody<{ items: unknown[] }>(feed).items[0]).toEqual(jsonBody(one));
  });

  it("refuse en 404 nommé une URL inconnue", async () => {
    const response = await staff().get(`${MEDIA}/one`).query({ url: "https://ailleurs/x.png" });
    expect(response.status).toBe(404);
    expect(jsonBody<{ code: string }>(response).code).toBe("media.not_in_library");
  });

  it("refuse en 404 une URL absente", async () => {
    const response = await staff().get(`${MEDIA}/one`);
    expect(response.status).toBe(404);
  });
});
