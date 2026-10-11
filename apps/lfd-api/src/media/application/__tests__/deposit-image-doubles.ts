import {
  MediaFailureLog,
  type LoggedFailure,
  type RefusedDeposit,
} from "../../domain/ports/media-failure-log.js";
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
import {
  MediaSeriesReader,
  type MediaSeriesLabel,
  type MediaSeriesListing,
} from "../../domain/ports/media-series.js";
import { MediaPalettes, type PaletteOutcome } from "../../domain/ports/media-palettes.js";
import type { ImagePalette } from "../../domain/value-objects/image-palette.js";

/** Les doublés du dépôt, partagés par ses deux suites (sortis le 2026-10-11). */

export function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

export class FakeStore extends MediaStore {
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

/**
 * L'historique des refus, qui garde ce qu'on lui donne.
 *
 * 🔴 C'est sur lui que porte la vérification qui compte : un refus doit
 * s'INSCRIRE, et l'inscription ne doit rien empêcher. Un doublé muet laisserait
 * le cas vert sur un historique qui ne s'écrit jamais.
 */
export class RecordingFailures extends MediaFailureLog {
  readonly recorded: RefusedDeposit[] = [];

  record(failure: RefusedDeposit): Promise<void> {
    this.recorded.push(failure);
    return Promise.resolve();
  }

  recent(): Promise<readonly LoggedFailure[]> {
    return Promise.resolve([]);
  }

  forgetBefore(): Promise<number> {
    return Promise.resolve(0);
  }
}

/** Les séries connues — `Été` seulement. */
export class FakeSeries extends MediaSeriesReader {
  readonly asked: string[] = [];

  list(): Promise<readonly MediaSeriesListing[]> {
    return Promise.resolve([]);
  }
  find(id: string): Promise<MediaSeriesLabel | null> {
    this.asked.push(id);
    return Promise.resolve(id === "series_ete" ? { id, title: "Été" } : null);
  }
}

export class FakeLibrary extends MediaLibrary {
  readonly registered: Omit<RegisteredMedia, "id">[] = [];

  /** Ce que le fonds porte déjà, par URL — un redépôt tombe dessus. */
  constructor(private readonly existing: readonly RegisteredMedia[] = []) {
    super();
  }

  alreadyRegistered(url: string): Promise<RegisteredMedia | null> {
    return Promise.resolve(this.existing.find((entry) => entry.url === url) ?? null);
  }

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

/**
 * Les palettes posées, une par URL — `paintIfBlank` n'écrit que sur une image
 * sans palette, comme la condition en base.
 */
export class RecordingPalettes extends MediaPalettes {
  readonly painted = new Map<string, ImagePalette>();
  readonly calls: string[] = [];

  constructor(private readonly known: readonly string[] = []) {
    super();
  }

  paintIfBlank(url: string, palette: ImagePalette): Promise<PaletteOutcome> {
    this.calls.push(url);
    if (this.painted.has(url)) {
      return Promise.resolve("already_painted");
    }
    if (this.known.length > 0 && !this.known.includes(url)) {
      return Promise.resolve("not_in_library");
    }
    this.painted.set(url, palette);
    return Promise.resolve("painted");
  }
}
