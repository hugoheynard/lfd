import {
  PublishedShopCopyCache,
  PublishedShopCopyReader,
  type PublishedShopCopy,
} from "../../domain/ports/published-shop-copy.reader.js";
import { ShopCopyReleaseRepository } from "../../domain/ports/shop-copy-release.repository.js";
import { ShopCopyRenamer } from "../../domain/ports/shop-copy-renamer.js";
import { ShopCopyRepository } from "../../domain/ports/shop-copy.repository.js";
import { ShopCopyEntry, type ShopCopyEntryState } from "../../domain/shop-copy-entry.js";
import {
  ShopCopyChangedError,
  ShopCopyPublishedMeanwhileError,
} from "../../domain/shop-copy-errors.js";
import type { ShopCopyLocale } from "../../domain/shop-copy-locale.js";
import { ShopCopyRelease } from "../../domain/shop-copy-release.js";

/**
 * Les textes en mémoire, avec le MÊME verrou que l'adaptateur : l'écriture est
 * conditionnée à la révision chargée. Il implémente les deux ports d'écriture
 * sur le même état, comme la table le fait.
 */
export class InMemoryShopCopy extends ShopCopyRepository {
  readonly rows = new Map<string, ShopCopyEntryState>();
  version = 0;

  load(key: string, locale: ShopCopyLocale): Promise<ShopCopyEntry> {
    const state = this.rows.get(`${key}|${locale}`);
    return Promise.resolve(
      state === undefined
        ? ShopCopyEntry.untouched(key, locale)
        : ShopCopyEntry.reconstitute(state),
    );
  }

  save(entry: ShopCopyEntry): Promise<void> {
    const state = entry.snapshot();
    const current = this.rows.get(`${state.key}|${state.locale}`)?.revision ?? 0;
    if (current !== state.revision - 1) {
      return Promise.reject(new ShopCopyChangedError(state.key, state.locale));
    }
    this.rows.set(`${state.key}|${state.locale}`, state);
    return Promise.resolve();
  }

  state(key: string, locale: ShopCopyLocale): ShopCopyEntryState | undefined {
    return this.rows.get(`${key}|${locale}`);
  }
}

/** Le port de « Publier », sur le même état que {@link InMemoryShopCopy}. */
export class InMemoryReleases extends ShopCopyReleaseRepository {
  /** Simule une publication concurrente tombée entre le chargement et l'écriture. */
  raceVersion = false;

  constructor(private readonly texts: InMemoryShopCopy) {
    super();
  }

  load(): Promise<ShopCopyRelease> {
    const pending = [...this.texts.rows.values()]
      .filter((state) => state.draft.state !== "unchanged")
      .map((state) => ShopCopyEntry.reconstitute(state));
    return Promise.resolve(ShopCopyRelease.of(this.texts.version, pending));
  }

  save(release: ShopCopyRelease): Promise<void> {
    if (this.raceVersion || this.texts.version !== release.expectedVersion) {
      return Promise.reject(new ShopCopyPublishedMeanwhileError());
    }
    this.texts.version = release.version;
    for (const entry of release.entries) {
      const state = entry.snapshot();
      this.texts.rows.set(`${state.key}|${state.locale}`, state);
    }
    return Promise.resolve();
  }
}

/** Un cache qui se souvient d'avoir été oublié. */
export class RecordingCache extends PublishedShopCopyCache {
  forgotten = 0;
  forget(): void {
    this.forgotten += 1;
  }
}

/** Les remplacements publiés, tels quels. */
export class StaticPublished extends PublishedShopCopyReader {
  constructor(private readonly published: PublishedShopCopy) {
    super();
  }
  read(): Promise<PublishedShopCopy> {
    return Promise.resolve(this.published);
  }
}

/** Un renommeur qui garde les déplacements demandés. */
export class RecordingRenamer extends ShopCopyRenamer {
  readonly calls: [string, string][] = [];
  constructor(private readonly movedPerCall = 1) {
    super();
  }
  relocate(from: string, to: string): Promise<number> {
    this.calls.push([from, to]);
    return Promise.resolve(this.movedPerCall);
  }
}
