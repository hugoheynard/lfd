/**
 * E2E des **bords HTTP de la médiathèque** — ce que la revue SOLID/DDD du
 * 2026-10-11 a trouvé entre le corps reçu et le handler.
 *
 * Trois régressions, chacune avec le symptôme d'origine :
 *
 * - un corps mal formé rendait **500** : quatre routes appelaient
 *   `schema.parse(body)` dans le contrôleur, et l'erreur Zod brute n'est pas
 *   une `AppError` — le filtre la prenait pour une panne ;
 * - `POST /media` renvoyait la **clé de bucket** (`storageKey`), qu'aucun
 *   écran n'a à connaître et que `GET /media` prend soin de taire ;
 * - deux dépôts SIMULTANÉS des mêmes octets rendaient **409** « Cette
 *   ressource existe déjà » au second, alors qu'un dépôt successif rend
 *   l'image déjà au fonds.
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

/** Un PNG minimal et valide ; deux tailles distinctes = deux images. */
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

describe("un corps mal formé est un 400 nommé, pas une panne", () => {
  /** Régression : `mediaDetailsPayloadSchema.parse(body)` dans le contrôleur rendait 500. */
  it("refuse en 400 une description sans URL", async () => {
    const response = await staff().put(MEDIA).send({ name: "croissant" });
    expect(response.status).toBe(400);
    expect(jsonBody<{ code: string }>(response).code).toBe("http.payload.invalid");
  });

  /** Régression : même `.parse` sur le renommage d'un mot-clé. */
  it("refuse en 400 un renommage sans mot de départ", async () => {
    const response = await staff().put(`${MEDIA}/tags/rename`).send({ to: "dorure" });
    expect(response.status).toBe(400);
  });

  /** Régression : même `.parse` à l'ouverture et à la correction d'une série. */
  it("refuse en 400 une série dont le corps n'est pas un objet", async () => {
    const opened = await staff().post(`${MEDIA}/series`).send([1, 2]);
    expect(opened.status).toBe(400);
    const corrected = await staff().put(`${MEDIA}/series/whatever`).send([1, 2]);
    expect(corrected.status).toBe(400);
  });
});

describe("les paramètres de requête ont une forme et des bornes", () => {
  it("refuse en 400 une taille d'historique qui n'est pas un nombre", async () => {
    const response = await staff().get(`${MEDIA}/failures`).query({ limit: "beaucoup" });
    expect(response.status).toBe(400);
  });

  it("refuse en 400 une taille d'historique hors bornes", async () => {
    const response = await staff().get(`${MEDIA}/failures`).query({ limit: "100000" });
    expect(response.status).toBe(400);
  });

  it("sert l'historique sans paramètre", async () => {
    const response = await staff().get(`${MEDIA}/failures`);
    expect(response.status).toBe(200);
  });
});

describe("le dépôt", () => {
  /** Régression : la réponse du dépôt sortait la clé de bucket. */
  it("ne rend PAS la clé de stockage", async () => {
    const response = await staff().post(MEDIA).attach("file", png(1280, 960), "image.png");
    expect(response.status).toBe(201);
    const body = jsonBody<Record<string, unknown>>(response);
    expect(body).not.toHaveProperty("storageKey");
    expect(body).toMatchObject({ width: 1280, height: 960, alreadyInLibrary: false });
  });

  /**
   * Régression : deux dépôts simultanés des mêmes octets lisaient tous deux
   * « absente », et le second butait sur l'unicité de l'URL — 409.
   */
  it("rend l'image déjà au fonds à deux dépôts SIMULTANÉS des mêmes octets", async () => {
    const responses = await Promise.all(
      [1, 2, 3].map(() => staff().post(MEDIA).attach("file", png(1300, 700), "image.png")),
    );
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    const bodies = responses.map((response) =>
      jsonBody<{ url: string; alreadyInLibrary: boolean }>(response),
    );
    expect(new Set(bodies.map((body) => body.url)).size).toBe(1);
    expect(bodies.filter((body) => !body.alreadyInLibrary)).toHaveLength(1);
  });
});
