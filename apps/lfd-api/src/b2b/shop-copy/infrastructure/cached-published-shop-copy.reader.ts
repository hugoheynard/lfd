import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import {
  PublishedShopCopyCache,
  PublishedShopCopyReader,
  type PublishedShopCopy,
} from "../domain/ports/published-shop-copy.reader.js";
import type { ShopCopyLocale } from "../domain/shop-copy-locale.js";
import { PublishedShopCopyStore } from "./published-shop-copy.store.js";

/**
 * Combien de temps une instance sert sa version publiée sans la relire.
 * C'est la borne de fraîcheur entre instances : une publication faite
 * ailleurs est vue ici au plus tard après ce délai.
 */
export const VERSION_RECHECK_MS = 15_000;

interface Stamp {
  readonly version: number;
  readonly checkedAt: number;
}

/**
 * **Les textes publiés, gardés en mémoire** — la boutique les lit à chaque
 * visite, et ils changent quelques fois par semaine.
 *
 * - **Chaud** (moins de {@link VERSION_RECHECK_MS} depuis la dernière
 *   relecture de la version) : zéro requête.
 * - **Tiède** : une requête — la version, une ligne. Inchangée, on sert la
 *   mémoire.
 * - **Froid** (version changée, ou langue jamais lue) : deux — la version,
 *   puis les textes de la langue.
 *
 * 🔴 L'API peut tourner en plusieurs instances : `forget()` n'invalide que
 * CELLE qui a publié. Les autres sont tenues par l'estampille — la version
 * publiée, qui ne monte qu'à « Publier » —, relue au plus toutes les
 * {@link VERSION_RECHECK_MS}. Une langue lue sous une version plus ancienne
 * que l'estampille est rechargée ; une publication tombée entre la lecture de
 * la version et celle des textes se corrige à la relecture suivante.
 *
 * ⚠️ Le harnais e2e appelle `forget()` à chaque remise à zéro : un `TRUNCATE`
 * fait revenir la version en arrière, et une langue gardée sous l'ancienne
 * serait resservie.
 */
@Injectable()
export class CachedPublishedShopCopyReader
  extends PublishedShopCopyReader
  implements PublishedShopCopyCache
{
  private stamp: Stamp | null = null;
  private pendingStamp: Promise<number> | null = null;
  private readonly byLocale = new Map<ShopCopyLocale, PublishedShopCopy>();

  constructor(
    private readonly store: PublishedShopCopyStore,
    private readonly clock: Clock,
  ) {
    super();
  }

  async read(locale: ShopCopyLocale): Promise<PublishedShopCopy> {
    const version = await this.currentVersion();
    const cached = this.byLocale.get(locale);
    if (cached !== undefined && cached.version === version) {
      return cached;
    }
    const fresh = { version, texts: await this.store.texts(locale) };
    this.byLocale.set(locale, fresh);
    return fresh;
  }

  forget(): void {
    this.stamp = null;
    this.byLocale.clear();
  }

  private async currentVersion(): Promise<number> {
    const now = this.clock.now().getTime();
    if (this.stamp !== null && now - this.stamp.checkedAt < VERSION_RECHECK_MS) {
      return this.stamp.version;
    }
    // Une seule relecture en vol, partagée par les requêtes qui arrivent
    // ensemble ; oubliée une fois résolue.
    this.pendingStamp ??= this.store.version().finally(() => {
      this.pendingStamp = null;
    });
    const version = await this.pendingStamp;
    this.stamp = { version, checkedAt: now };
    return version;
  }
}
