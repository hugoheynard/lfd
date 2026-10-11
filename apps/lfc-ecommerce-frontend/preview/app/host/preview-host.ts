import type { ApplicationRef } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import type {
  ShopCopyPreviewOutbound,
  ShopCopyPreviewShowMessage,
} from '@lfd/contracts/shop-copy-preview';

import { App } from '../../../src/app/app';
import { ClientLocale } from '../../../src/app/client/client-locale.service';
import { ShopCopyOverrides } from '../../../src/app/client/copy/shop-copy-overrides';
import { previewConfig } from '../composition/preview-config';
import type { PreviewStorages } from '../composition/memory-storage';
import { highlightKey, keyAtClick, visibleKeys } from '../copy-picking/copy-highlighter';
import { CopyMarkers } from '../copy-picking/copy-markers';
import { PREVIEW_JOURNEYS } from '../journeys/journeys';
import { OutsideFrame } from '../outside-frame/outside-frame';
import { outbound, readShowMessage } from '../protocol/preview-messages';

/** Le temps de calme après un changement du DOM avant de relever les clés visibles. */
const SETTLE_MS = 250;

/**
 * **Le chef d'orchestre de l'aperçu** — il parle au back-office, et démarre
 * la boutique dans l'état du parcours demandé (plan
 * `plan-textes-de-la-boutique.md`, §5, §6, §10 B3).
 *
 * - **Hors cadre** (aucun parent, ou un parent dont l'origine n'est pas sur la
 *   liste) : il démarre l'écran « Cet aperçu s'ouvre depuis le back-office »,
 *   et ne fait RIEN d'autre — aucun écouteur, aucun message.
 * - **Encadré** : il annonce `ready` au back-office, puis applique chaque
 *   `show`. Un changement de parcours REDÉMARRE la boutique — stockage vidé,
 *   injecteur neuf : un parcours ne garde rien du précédent. Un changement de
 *   textes, de langue ou de surbrillance s'applique à la boutique en place.
 *
 * Il n'envoie qu'aux origines du back-office, jamais à `'*'`.
 */
export class PreviewHost {
  private readonly markers = new CopyMarkers();
  private app: ApplicationRef | null = null;
  private journey: ShopCopyPreviewShowMessage['journey'] | null = null;
  /** L'origine du back-office qui nous parle, connue au premier `show` accepté. */
  private editorOrigin: string | null = null;
  /** Les `show` s'appliquent un par un ; seul le dernier reçu compte. */
  private queue: Promise<void> = Promise.resolve();
  private latest: ShopCopyPreviewShowMessage | null = null;
  private highlight: string | null = null;
  private lastKeys = '';
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly win: Window,
    private readonly allowedOrigins: readonly string[],
    private readonly storages: PreviewStorages,
  ) {}

  /** Démarre : l'écran hors cadre, ou l'écoute du back-office. */
  async start(): Promise<void> {
    if (!this.framedByEditor()) {
      await bootstrapApplication(OutsideFrame);
      return;
    }
    this.win.addEventListener('message', (event) => this.receive(event));
    this.win.document.addEventListener('click', (event) => this.pick(event), { capture: true });
    new MutationObserver(() => this.scheduleSettle()).observe(this.win.document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.send(outbound({ type: 'ready' }));
  }

  /** Le démarrage du parcours demandé, ou rien s'il tourne déjà. */
  private receive(event: MessageEvent): void {
    const message = readShowMessage(event, this.allowedOrigins, this.win.parent);
    if (message === null) {
      return;
    }
    this.editorOrigin = event.origin;
    this.latest = message;
    this.queue = this.queue.then(() => this.applyLatest());
  }

  private async applyLatest(): Promise<void> {
    const message = this.latest;
    if (message === null) {
      return;
    }
    this.latest = null;
    if (this.journey !== message.journey || this.app === null) {
      await this.remount(message);
    } else {
      this.applyCopy(message);
    }
  }

  /** Un parcours neuf : la boutique précédente détruite, le stockage vidé, puis on rejoue. */
  private async remount(message: ShopCopyPreviewShowMessage): Promise<void> {
    this.app?.destroy();
    this.app = null;
    this.storages.local.clear();
    this.storages.session.clear();
    const journey = PREVIEW_JOURNEYS[message.journey];
    // L'adresse du parcours précédent ne doit pas monter son écran au démarrage.
    this.win.history.replaceState(null, '', '/');
    this.ensureRoot();
    const app = await bootstrapApplication(App, previewConfig(journey.world, this.markers));
    this.app = app;
    this.journey = message.journey;
    // Les textes AVANT le parcours : le premier écran se dessine déjà avec eux.
    this.applyCopy(message);
    await journey.enter(app.injector);
  }

  private applyCopy(message: ShopCopyPreviewShowMessage): void {
    const injector = this.app?.injector;
    if (injector === undefined) {
      return;
    }
    injector
      .get(ShopCopyOverrides)
      .receive(message.locale, { ...message.published, ...message.drafts });
    injector.get(ClientLocale).current.set(message.locale);
    this.win.document.documentElement.lang = message.locale;
    this.highlight = message.highlight;
    this.scheduleSettle();
  }

  /** Un clic sur un texte marqué : sa clé part au back-office. Le clic, lui, agit comme d'habitude. */
  private pick(event: MouseEvent): void {
    const key = keyAtClick(event, this.markers);
    if (key !== null) {
      this.send(outbound({ type: 'pick', key }));
    }
  }

  /** Après chaque changement du DOM : la surbrillance reposée, les clés visibles relevées. */
  private scheduleSettle(): void {
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
    }
    this.settleTimer = setTimeout(() => this.settle(), SETTLE_MS);
  }

  private settle(): void {
    this.settleTimer = null;
    const body = this.win.document.body;
    highlightKey(body, this.highlight, this.markers)?.scrollIntoView({ block: 'nearest' });
    const keys = visibleKeys(body, this.markers);
    const signature = keys.join('\n');
    if (signature !== this.lastKeys) {
      this.lastKeys = signature;
      this.send(outbound({ type: 'visible-keys', keys }));
    }
  }

  /**
   * Envoie au back-office — à SON origine une fois connue ; avant le premier
   * `show`, à chacune des origines autorisées, et le navigateur ne livre qu'à
   * celle qui nous encadre réellement. Jamais `'*'`.
   */
  private send(message: ShopCopyPreviewOutbound): void {
    const targets = this.editorOrigin === null ? this.allowedOrigins : [this.editorOrigin];
    for (const origin of targets) {
      this.win.parent.postMessage(message, origin);
    }
  }

  /**
   * Encadrés par le back-office ? Sans parent, non. Avec un parent, on lit son
   * origine quand le navigateur la donne (`ancestorOrigins`) — elle devient
   * alors la seule destination ; sinon on la suppose — l'en-tête
   * `frame-ancestors` a déjà refusé tout autre encadrement, et la garde des
   * messages refuse tout autre émetteur.
   */
  private framedByEditor(): boolean {
    if (this.win.parent === this.win) {
      return false;
    }
    const ancestors = this.win.location.ancestorOrigins;
    const parentOrigin =
      ancestors === undefined || ancestors.length === 0 ? null : ancestors.item(0);
    if (parentOrigin === null) {
      return true;
    }
    if (!this.allowedOrigins.includes(parentOrigin)) {
      return false;
    }
    this.editorOrigin = parentOrigin;
    return true;
  }

  /** La racine de la boutique : détruire une application retire son élément hôte. */
  private ensureRoot(): void {
    const document = this.win.document;
    if (document.querySelector('app-root') === null) {
      document.body.prepend(document.createElement('app-root'));
    }
  }
}
