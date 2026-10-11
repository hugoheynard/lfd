import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  SHOP_COPY_PREVIEW_JOURNEYS,
  SHOP_COPY_PREVIEW_SOURCE,
  type ShopCopyPreviewJourney,
  type ShopCopyPreviewShowMessage,
  type ShopCopyPreviewViewport,
} from '@lfd/contracts/shop-copy-preview';

import { previewOrigin, SHOP_PREVIEW_URL_TOKEN } from '../data/shop-preview-config';
import { acceptPreviewMessage, type IncomingMessage } from '../rules/preview-messages';
import { CopyNavigation } from './copy-navigation';
import { DraftWriter } from './draft-writer';
import { ShopCopyStore } from './shop-copy-store';

/** Ce à quoi l'on écrit : la fenêtre de l'iframe, réduite à ce qu'on lui demande. */
export interface PreviewWindow {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * **La conversation avec l'aperçu** (plan §10 B3, protocole
 * `@lfd/contracts/shop-copy-preview`) : on attend `ready`, puis on envoie
 * `show` à chaque changement — parcours, langue, largeur, brouillons, clé
 * surlignée. On reçoit `pick` (ouvrir une clé) et `visible-keys`.
 *
 * 🔴 Un message n'est lu que s'il vient de l'origine configurée ET de notre
 * iframe (`acceptPreviewMessage`) ; on n'écrit qu'à cette origine, jamais `'*'`.
 */
@Injectable()
export class PreviewLink {
  private readonly store = inject(ShopCopyStore);
  private readonly navigation = inject(CopyNavigation);
  private readonly writer = inject(DraftWriter);

  readonly url = inject(SHOP_PREVIEW_URL_TOKEN);
  readonly origin = previewOrigin(this.url);

  readonly journey = signal<ShopCopyPreviewJourney>(SHOP_COPY_PREVIEW_JOURNEYS[0]);
  /** La langue de l'aperçu est celle de l'écran : une seule source, la navigation. */
  readonly locale = this.navigation.locale;
  readonly viewport = signal<ShopCopyPreviewViewport>('mobile');
  readonly ready = signal(false);

  private frame: PreviewWindow | null = null;

  /** L'état complet à montrer — idempotent, le dernier gagne. */
  readonly show = computed<ShopCopyPreviewShowMessage>(() => {
    const locale = this.locale();
    const drafts: Record<string, string> = {};
    const published: Record<string, string> = {};
    for (const entry of this.store.entries()) {
      const view = entry.locales[locale];
      if (view.publishedText !== null) {
        published[entry.key] = view.publishedText;
      }
      if (view.draftState === 'set' && view.draftText !== null) {
        drafts[entry.key] = view.draftText;
      } else if (view.draftState === 'reset' && view.original !== null) {
        drafts[entry.key] = view.original;
      }
    }
    for (const [key, text] of this.writer.typedIn(locale)) {
      drafts[key] = text;
    }
    return {
      source: SHOP_COPY_PREVIEW_SOURCE,
      type: 'show',
      journey: this.journey(),
      locale,
      viewport: this.viewport(),
      drafts,
      published,
      highlight: this.navigation.selectedKey(),
    };
  });

  constructor() {
    effect(() => {
      const message = this.show();
      if (this.ready()) {
        this.post(message);
      }
    });
  }

  /** L'iframe s'est (re)chargée : on attend de nouveau son `ready`. */
  attach(frame: PreviewWindow | null): void {
    this.frame = frame;
    this.ready.set(false);
  }

  receive(event: IncomingMessage): void {
    const message = acceptPreviewMessage(event, this.origin, this.frame);
    switch (message?.type) {
      case 'ready':
        // Déjà prêt : l'aperçu a redémarré sans que l'iframe recharge, et
        // l'effet ne repartirait pas — on renvoie l'état à la main.
        if (this.ready()) {
          this.post(this.show());
        } else {
          this.ready.set(true);
        }
        return;
      case 'pick':
        this.navigation.openKey(message.key);
        return;
      case 'visible-keys':
        this.navigation.setVisibleKeys(message.keys);
        return;
      default:
        return;
    }
  }

  private post(message: ShopCopyPreviewShowMessage): void {
    if (this.frame !== null && this.origin !== null) {
      this.frame.postMessage(message, this.origin);
    }
  }
}
