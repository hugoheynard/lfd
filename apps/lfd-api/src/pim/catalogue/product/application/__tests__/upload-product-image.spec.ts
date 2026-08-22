import {
  MediaStore,
  type PublicAsset,
  type StoredAsset,
} from "../../../../../platform/storage/media-store.js";
import {
  MediaLibrary,
  type MediaFacts,
  type RegisteredMedia,
} from "../../domain/ports/media-library.js";
import { UnsupportedImageError } from "../../domain/value-objects/product-image.js";
import { UploadProductImageCommand, UploadProductImageHandler } from "../upload-product-image.js";

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

class FakeStore extends MediaStore {
  readonly puts: { prefix: string; asset: PublicAsset }[] = [];
  readonly removed: string[] = [];

  put(prefix: string, asset: PublicAsset): Promise<StoredAsset> {
    this.puts.push({ prefix, asset });
    const key = `${prefix}/deadbeef.png`;
    return Promise.resolve({ storageKey: key, url: `https://media.example/${key}` });
  }
  // Le dépôt sait supprimer depuis le ramassage des orphelins ; l'envoi ne s'en
  // sert pas, mais un double doit implémenter le port qu'il prétend jouer.
  remove(storageKey: string): Promise<void> {
    this.removed.push(storageKey);
    return Promise.resolve();
  }
}

class FakeLibrary extends MediaLibrary {
  readonly registered: Omit<RegisteredMedia, "id">[] = [];

  register(entry: Omit<RegisteredMedia, "id">): Promise<RegisteredMedia> {
    this.registered.push(entry);
    return Promise.resolve({ id: "media_1", ...entry });
  }

  factsFor(): Promise<MediaFacts | null> {
    return Promise.resolve(null);
  }
  findOrphanKeys(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  isStillOrphan(): Promise<boolean> {
    return Promise.resolve(false);
  }
  forget(): Promise<number> {
    return Promise.resolve(0);
  }
}

describe("UploadProductImageHandler", () => {
  it("range les octets puis inscrit ce qu'il en a MESURÉ", async () => {
    const store = new FakeStore();
    const library = new FakeLibrary();
    const handler = new UploadProductImageHandler(store, library);

    const result = await handler.execute(new UploadProductImageCommand(png(1200, 800)));

    expect(store.puts).toEqual([
      { prefix: "products", asset: { bytes: png(1200, 800), contentType: "image/png" } },
    ]);
    expect(library.registered[0]).toMatchObject({
      url: "https://media.example/products/deadbeef.png",
      storageKey: "products/deadbeef.png",
      contentType: "image/png",
      width: 1200,
      height: 800,
      bytes: 24,
    });
    expect(result.id).toBe("media_1");
  });

  it("refuse AVANT de ranger quoi que ce soit", async () => {
    // L'ordre est la règle : une image refusée ne doit rien laisser derrière
    // elle, ni dans le bucket ni en base.
    const store = new FakeStore();
    const library = new FakeLibrary();
    const handler = new UploadProductImageHandler(store, library);

    await expect(
      handler.execute(new UploadProductImageCommand(Buffer.from("pas une image"))),
    ).rejects.toThrow(UnsupportedImageError);

    expect(store.puts).toEqual([]);
    expect(library.registered).toEqual([]);
  });

  it("n'inscrit rien si le rangement échoue", async () => {
    class FailingStore extends MediaStore {
      put(): Promise<StoredAsset> {
        return Promise.reject(new Error("R2 refuse"));
      }
      remove(): Promise<void> {
        return Promise.resolve();
      }
    }
    const library = new FakeLibrary();
    const handler = new UploadProductImageHandler(new FailingStore(), library);

    await expect(handler.execute(new UploadProductImageCommand(png(400, 400)))).rejects.toThrow(
      "R2 refuse",
    );
    expect(library.registered).toEqual([]);
  });
});
