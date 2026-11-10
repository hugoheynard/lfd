import type { ShopCopyChange, ShopCopyEntry, ShopCopyStamp } from "./shop-copy-entry.js";
import { NothingToPublishError } from "./shop-copy-errors.js";
import type { ShopCopyManifest } from "./shop-copy-manifest.js";

/**
 * **Une publication** — tous les brouillons en attente, et la version courante.
 *
 * L'agrégat de « Publier » (A1) : il applique chaque brouillon, fait monter la
 * version d'un cran et rend la liste de ce qui change à l'écran, que le fait
 * du journal portera avant/après.
 */
export class ShopCopyRelease {
  private published = false;

  private constructor(
    private readonly loadedVersion: number,
    private readonly pending: readonly ShopCopyEntry[],
  ) {}

  /** `pending` : les textes dont le brouillon n'est pas `unchanged`. */
  static of(version: number, pending: readonly ShopCopyEntry[]): ShopCopyRelease {
    return new ShopCopyRelease(version, pending);
  }

  /** La version lue — la condition de l'écriture. */
  get expectedVersion(): number {
    return this.loadedVersion;
  }

  /** La version posée par la publication. */
  get version(): number {
    return this.published ? this.loadedVersion + 1 : this.loadedVersion;
  }

  /** Les textes touchés, à réécrire. */
  get entries(): readonly ShopCopyEntry[] {
    return this.pending;
  }

  /**
   * Publie. Rend les changements servis — vide si chaque brouillon rendait le
   * texte déjà publié ; la version monte quand même : un geste a eu lieu, et
   * les brouillons sont soldés.
   *
   * @throws {NothingToPublishError} aucun brouillon n'attend : une version
   *   vide ne dirait rien au journal.
   */
  publish(manifest: ShopCopyManifest, stamp: ShopCopyStamp): readonly ShopCopyChange[] {
    const publishable = this.pending.filter(
      (entry) => entry.snapshot().draft.state === "reset" || manifest.knows(entry.key),
    );
    if (publishable.length === 0) {
      throw new NothingToPublishError();
    }
    this.published = true;
    return publishable.flatMap((entry) => {
      const change = entry.publish(manifest, stamp);
      return change === null ? [] : [change];
    });
  }
}
