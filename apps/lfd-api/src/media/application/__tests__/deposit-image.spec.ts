import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingMediaJournal } from "../../journal/__tests__/recording-media-journal.js";
import {
  MediaStore,
  type PublicAsset,
  type StoredAsset,
} from "../../../platform/storage/media-store.js";
import {
  MediaLibrary,
  type MediaFacts,
  type RegisteredMedia,
} from "../../domain/ports/media-library.js";
import { UnsupportedImageError } from "../../domain/value-objects/image-bytes.js";
import { DepositImageCommand, DepositImageHandler } from "../deposit-image.js";

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
  findCandidates(): Promise<readonly { storageKey: string; url: string }[]> {
    return Promise.resolve([]);
  }
  stillOld(): Promise<string | null> {
    return Promise.resolve(null);
  }
  forget(): Promise<number> {
    return Promise.resolve(0);
  }
}

describe("DepositImageHandler", () => {
  it("range les octets puis inscrit ce qu'il en a MESURÉ", async () => {
    const store = new FakeStore();
    const library = new FakeLibrary();
    const journal = new RecordingMediaJournal();
    const handler = new DepositImageHandler(store, library, journal, new DirectUnitOfWork());

    const result = await handler.execute(new DepositImageCommand(png(1200, 800)));

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
    // 🔴 Un dépôt AFFIRME quelque chose : une image est entrée dans la
    // bibliothèque. Sans ce fait, rien ne dira jamais qui l'a mise là — et une
    // lacune de journal ne se rattrape pas.
    expect(journal.entries).toMatchObject([
      {
        type: "media_asset.deposited",
        subjectType: "media_asset",
        subjectId: "https://media.example/products/deadbeef.png",
        payload: { subjectLabel: "deadbeef.png", contentType: "image/png" },
      },
    ]);
    expect(result.id).toBe("media_1");
  });

  it("refuse AVANT de ranger quoi que ce soit", async () => {
    // L'ordre est la règle : une image refusée ne doit rien laisser derrière
    // elle, ni dans le bucket ni en base.
    const store = new FakeStore();
    const library = new FakeLibrary();
    const handler = new DepositImageHandler(
      store,
      library,
      new RecordingMediaJournal(),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(new DepositImageCommand(Buffer.from("pas une image"))),
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
    const handler = new DepositImageHandler(
      new FailingStore(),
      library,
      new RecordingMediaJournal(),
      new DirectUnitOfWork(),
    );

    await expect(handler.execute(new DepositImageCommand(png(400, 400)))).rejects.toThrow(
      "R2 refuse",
    );
    expect(library.registered).toEqual([]);
  });
});
