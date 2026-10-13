/**
 * E2E du **redépôt retrouvé par le contenu** — lot D0 du plan du préfixe
 * universel de la médiathèque (2026-10-13).
 *
 * Le dépôt retrouvait une image déjà au fonds par son URL, qui porte le
 * préfixe de la clé. Ici, le magasin range d'abord sous un ancien préfixe, puis
 * sous le préfixe courant : les mêmes octets doivent retomber sur la même ligne,
 * celle que les porteurs citent. Tout passe par le vrai chemin — seul le
 * magasin d'octets est doublé, comme dans toutes les e2e de la médiathèque.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  MediaStore,
  type PublicAsset,
  type StoredAsset,
} from "../src/platform/storage/media-store.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token === "staff-e2e" ? E2E_STAFF_SUB : token, scopes: [] }),
};

/** Un magasin dont on peut imposer le préfixe — l'état d'avant une bascule. */
class PrefixedStore extends InMemoryMediaStore {
  forcedPrefix: string | null = null;

  override put(prefix: string, asset: PublicAsset): Promise<StoredAsset> {
    return super.put(this.forcedPrefix ?? prefix, asset);
  }
}

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

const store = new PrefixedStore();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MediaStore, value: store },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  store.forcedPrefix = null;
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

describe("POST /media — un redépôt sous un autre préfixe", () => {
  it("retombe sur l'image déjà au fonds, sans seconde ligne", async () => {
    store.forcedPrefix = "ancien-prefixe";
    const first = await staff().post("/media").attach("file", png(640, 480), "a.png");
    expect(first.status).toBe(201);
    const original = jsonBody<{ url: string; id: string }>(first);
    expect(original.url).toContain("/ancien-prefixe/");

    store.forcedPrefix = null;
    const again = await staff().post("/media").attach("file", png(640, 480), "a.png");

    expect(again.status).toBe(201);
    expect(jsonBody<{ url: string; id: string; alreadyInLibrary: boolean }>(again)).toMatchObject({
      id: original.id,
      url: original.url,
      alreadyInLibrary: true,
    });
    expect(await ctx.prisma.mediaAsset.count()).toBe(1);
  });

  it("des octets différents font bien une image neuve", async () => {
    store.forcedPrefix = "ancien-prefixe";
    await staff().post("/media").attach("file", png(640, 480), "a.png").expect(201);
    store.forcedPrefix = null;
    await staff().post("/media").attach("file", png(641, 480), "b.png").expect(201);

    expect(await ctx.prisma.mediaAsset.count()).toBe(2);
  });
});
