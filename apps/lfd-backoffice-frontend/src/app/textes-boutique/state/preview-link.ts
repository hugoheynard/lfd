import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  isShopCopyPreviewScene,
  SHOP_COPY_OUTSIDE_SCREENS,
  SHOP_COPY_PREVIEW_SOURCE,
  type ShopCopyAudience,
  type ShopCopyPreviewEditMessage,
  type ShopCopyPreviewInbound,
  type ShopCopyPreviewStep,
  type ShopCopyPreviewShowMessage,
  type ShopCopyPreviewViewport,
} from '@lfd/contracts/shop-copy-preview';

import { previewOrigin, SHOP_PREVIEW_URL_TOKEN } from '../data/shop-preview-config';
import { missingVariables } from '../rules/copy-text';
import { acceptPreviewMessage, type IncomingMessage } from '../rules/preview-messages';
import { CopyNavigation } from './copy-navigation';
import { DraftWriter } from './draft-writer';
import { ShopCopyStore } from './shop-copy-store';

/**
 * Ce à quoi l'on écrit : la fenêtre de l'iframe, ou la fenêtre détachée —
 * réduite à ce qu'on lui demande.
 */
export interface PreviewWindow {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * **La conversation avec l'aperçu** (plan §10 B3, protocole
 * `@lfd/contracts/shop-copy-preview`) : on attend `ready`, puis on envoie
 * `show` à chaque changement — clientèle, étape, langue, largeur, brouillons, clé
 * surlignée. On reçoit `pick` (ouvrir une clé), `visible-keys` et `edit` (un
 * texte tapé dans l'aperçu, auquel on répond `edit-refused` s'il perd une variable).
 *
 * **Une seule cible à la fois** (2026-10-11) : l'iframe, ou la fenêtre
 * détachée (`detached`). Changer de cible oublie l'autre — un message de
 * l'ancienne est alors refusé comme celui de n'importe quelle fenêtre.
 *
 * 🔴 Un message n'est lu que s'il vient de l'origine configurée ET de la cible
 * active (`acceptPreviewMessage`) ; on n'écrit qu'à cette origine, jamais `'*'`.
 */
@Injectable()
export class PreviewLink {
  private readonly store = inject(ShopCopyStore);
  private readonly navigation = inject(CopyNavigation);
  private readonly writer = inject(DraftWriter);

  readonly url = inject(SHOP_PREVIEW_URL_TOKEN);
  readonly origin = previewOrigin(this.url);

  /** Qui regarde : celle de l'écran, choisie en tête de page. */
  readonly audience = this.navigation.audience;
  /** L'étape demandée — gardée d'une clientèle à l'autre. */
  private readonly requestedStep = signal<ShopCopyPreviewStep>('welcome');
  /**
   * L'étape montrée : celle demandée, si la clientèle l'a. Sinon (la fidélité
   * en pro), le premier écran hors commande de la clientèle, ou la bienvenue.
   */
  readonly step = computed<ShopCopyPreviewStep>(() =>
    fallbackStep(this.audience(), this.requestedStep()),
  );
  /** La langue de l'aperçu est celle de l'écran : une seule source, la navigation. */
  readonly locale = this.navigation.locale;
  /** Bureau par défaut (Hugo, 2026-10-11) : dézoomé dans la colonne. Rien n'est mémorisé. */
  readonly viewport = signal<ShopCopyPreviewViewport>('desktop');
  readonly ready = signal(false);
  /** L'aperçu vit dans une autre fenêtre : la colonne n'encadre plus rien. */
  readonly detached = signal(false);

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
      audience: this.audience(),
      step: this.step(),
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

  /** Choisit une étape ; l'ancienne liste des clés montrées ne vaut plus. */
  setStep(step: ShopCopyPreviewStep): void {
    if (step !== this.step()) {
      this.navigation.visibleKeys.set(null);
    }
    this.requestedStep.set(step);
  }

  /**
   * La cible des messages. Une NOUVELLE fenêtre attend son `ready` ; la même
   * (l'iframe qui recharge, ou rebranchée à son `load`) garde son état : un
   * aperçu rechargé renvoie `ready`, et l'éditeur lui répond par l'état
   * courant (cf. `receive`). Remettre `ready` à faux sur la même fenêtre
   * effaçait un `ready` reçu pendant le chargement, avant le `load`.
   */
  attach(frame: PreviewWindow | null): void {
    if (frame === this.frame) {
      return;
    }
    this.frame = frame;
    this.ready.set(false);
  }

  /** La fenêtre détachée devient la seule cible ; l'iframe est oubliée. */
  detachTo(popup: PreviewWindow): void {
    this.attach(popup);
    this.detached.set(true);
  }

  /** Retour à la colonne : plus de cible tant que l'iframe n'a pas rechargé. */
  reattach(): void {
    this.attach(null);
    this.detached.set(false);
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
      case 'edit':
        this.editInPlace(message);
        return;
      default:
        return;
    }
  }

  /**
   * **Un texte tapé dans l'aperçu** (2026-10-12) — traité EXACTEMENT comme une
   * frappe dans la colonne : même `DraftWriter`, donc même pause, même
   * révision, même `409`. L'aperçu ne fait que proposer : une clé inconnue ou
   * une autre langue que celle affichée est ignorée ; un texte qui perd une
   * variable n'est pas écrit du tout, et l'aperçu reçoit `edit-refused`.
   */
  private editInPlace(message: ShopCopyPreviewEditMessage): void {
    const entry = this.store.entry(message.key);
    if (entry === null || message.locale !== this.locale()) {
      return;
    }
    if (!this.store.canWrite()) {
      this.refuse(message.key, 'Vous ne pouvez pas modifier les textes de la boutique.');
      return;
    }
    const missing = entry.space === null ? [] : missingVariables(message.text, entry.variables);
    if (missing.length > 0) {
      const names = missing.map((name) => `{${name}}`).join(', ');
      this.refuse(message.key, `Il faut garder ${names}`);
      return;
    }
    this.writer.edit(entry, message.locale, message.text);
  }

  private refuse(key: string, reason: string): void {
    this.post({ source: SHOP_COPY_PREVIEW_SOURCE, type: 'edit-refused', key, reason });
  }

  private post(message: ShopCopyPreviewInbound): void {
    if (this.frame !== null && this.origin !== null) {
      this.frame.postMessage(message, this.origin);
    }
  }
}

function fallbackStep(audience: ShopCopyAudience, step: ShopCopyPreviewStep): ShopCopyPreviewStep {
  if (isShopCopyPreviewScene(audience, step)) {
    return step;
  }
  const outside: readonly ShopCopyPreviewStep[] = SHOP_COPY_OUTSIDE_SCREENS[audience];
  return outside[0] ?? 'welcome';
}
