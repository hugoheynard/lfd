import { isLayoutSectionId } from "@lfd/mailer";
import { Injectable } from "@nestjs/common";

import type { MailCopyOverlay } from "../../../platform/mailer/copy/mail-copy-overlay.js";
import { PublishedMailCopyReader } from "../../../platform/mailer/effective-copy/published-mail-copy.reader.js";
import type { MailSectionOrders } from "../../../platform/mailer/sections/mail-layout-scope.js";
import { Clock } from "../../../platform/time/clock.js";
import { PublishedMailCopyCache } from "../domain/ports/published-mail-copy.cache.js";
import { MAIL_COPY_LOCALES } from "../domain/mail-copy-locale.js";
import { MailCopyManifest } from "../domain/mail-copy-manifest.js";
import { replacementTexts } from "../domain/mail-copy-texts.js";
import { replacementSectionOrders } from "../domain/mail-section-orders.js";
import { PublishedMailCopyStore } from "./published-mail-copy.store.js";

/**
 * Combien de temps une instance sert sa version publiée sans la relire : la
 * borne de fraîcheur entre instances. Même valeur que les textes de la
 * boutique — une publication faite ailleurs part ici au plus tard après ce
 * délai.
 */
export const MAIL_COPY_VERSION_RECHECK_MS = 15_000;

interface Stamp {
  readonly version: number;
  readonly checkedAt: number;
}

/**
 * **Les textes d'e-mails publiés, gardés en mémoire** — le mailer les lit à
 * chaque envoi (plan `plan-textes-des-e-mails.md`, C2, E2). Il implémente le
 * port que le mailer déclare (`platform/`) ; `appBootstrap/` les relie.
 *
 * - **Chaud** (moins de {@link MAIL_COPY_VERSION_RECHECK_MS} depuis la
 *   dernière relecture de la version) : zéro requête.
 * - **Tiède** : une requête — la version. Inchangée, on sert la mémoire.
 * - **Froid** : deux — la version, puis les textes publiés.
 *
 * 🔴 L'API peut tourner en plusieurs instances : `forget()` n'invalide que
 * CELLE qui a publié ; les autres sont tenues par la version, relue au plus
 * toutes les {@link MAIL_COPY_VERSION_RECHECK_MS}.
 *
 * Ce qui en sort est filtré contre le dictionnaire de CE code
 * (`replacementTexts`) : une orpheline, ou un texte qui a perdu une variable
 * devenue obligatoire, n'est jamais envoyé — le défaut part à sa place. De
 * même un ordre de sections que les sections de ce code ne permettent plus
 * (`replacementSectionOrders`) : l'ordre du code part à sa place.
 *
 * ⚠️ Le harnais e2e appelle `forget()` à chaque remise à zéro : un `TRUNCATE`
 * fait revenir la version en arrière.
 */
@Injectable()
export class CachedPublishedMailCopyReader
  extends PublishedMailCopyReader
  implements PublishedMailCopyCache
{
  private stamp: Stamp | null = null;
  private pendingStamp: Promise<number> | null = null;
  private cached: { readonly version: number; readonly overlay: MailCopyOverlay } | null = null;
  private cachedOrders: { readonly version: number; readonly orders: MailSectionOrders } | null =
    null;

  constructor(
    private readonly store: PublishedMailCopyStore,
    private readonly manifest: MailCopyManifest,
    private readonly clock: Clock,
  ) {
    super();
  }

  async read(): Promise<MailCopyOverlay> {
    const version = await this.currentVersion();
    if (this.cached !== null && this.cached.version === version) {
      return this.cached.overlay;
    }
    const states = await this.store.published();
    const overlay: MailCopyOverlay = Object.fromEntries(
      MAIL_COPY_LOCALES.map((locale) => [
        locale,
        replacementTexts(states, this.manifest, locale, "published"),
      ]),
    );
    this.cached = { version, overlay };
    return overlay;
  }

  /**
   * L'ordre publié des sections (E4, S3), par la même version que les textes —
   * gardé à part : une table illisible ne doit pas emporter l'autre.
   */
  async sectionOrders(): Promise<MailSectionOrders> {
    const version = await this.currentVersion();
    if (this.cachedOrders !== null && this.cachedOrders.version === version) {
      return this.cachedOrders.orders;
    }
    const states = await this.store.publishedSectionOrders();
    const orders = Object.fromEntries(
      Object.entries(replacementSectionOrders(states, this.manifest, "published")).map(
        ([mail, order]) => [mail, order.filter(isLayoutSectionId)],
      ),
    );
    this.cachedOrders = { version, orders };
    return orders;
  }

  forget(): void {
    this.stamp = null;
    this.cached = null;
    this.cachedOrders = null;
  }

  private async currentVersion(): Promise<number> {
    const now = this.clock.now().getTime();
    if (this.stamp !== null && now - this.stamp.checkedAt < MAIL_COPY_VERSION_RECHECK_MS) {
      return this.stamp.version;
    }
    // Une seule relecture en vol, partagée par les envois qui arrivent ensemble.
    this.pendingStamp ??= this.store.version().finally(() => {
      this.pendingStamp = null;
    });
    const version = await this.pendingStamp;
    this.stamp = { version, checkedAt: now };
    return version;
  }
}
