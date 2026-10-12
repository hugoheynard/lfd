import type { ApplicationRef } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  SHOP_COPY_PREVIEW_VIEWPORT_WIDTHS,
  type ShopCopyPreviewOutbound,
  type ShopCopyPreviewShowMessage,
} from '@lfd/contracts/shop-copy-preview';

import { App } from '../../../src/app/app';
import { ClientLocale } from '../../../src/app/client/client-locale.service';
import { ShopCopyOverrides } from '../../../src/app/client/copy/shop-copy-overrides';
import { previewConfig } from '../composition/preview-config';
import type { PreviewStorages } from '../composition/memory-storage';
import { CopyEditing } from '../copy-editing/copy-editing';
import { highlightKey, visibleKeys } from '../copy-picking/copy-highlighter';
import { CopyMarkers } from '../copy-picking/copy-markers';
import { previewScene } from '../journeys/journeys';
import { OutsideFrame } from '../outside-frame/outside-frame';
import { outbound, readEditRefusedMessage, readShowMessage } from '../protocol/preview-messages';

/** Le temps de calme après un changement du DOM avant de relever les clés visibles. */
const SETTLE_MS = 250;

/**
 * Ouverts par une fenêtre dont on ne peut pas lire l'origine : le temps laissé
 * au back-office pour nous parler avant de montrer l'écran « hors cadre ».
 */
export const OPENER_GRACE_MS = 1500;

/** La largeur de la fenêtre détachée, selon la largeur simulée demandée. */
const WINDOW_WIDTHS: Readonly<Record<ShopCopyPreviewShowMessage['viewport'], number>> = {
  mobile: 430,
  desktop: SHOP_COPY_PREVIEW_VIEWPORT_WIDTHS.desktop,
};

/** Le back-office, vu d'ici : une fenêtre à qui écrire, et RIEN d'autre. */
interface EditorWindow {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * **Le chef d'orchestre de l'aperçu** — il parle au back-office, et démarre
 * la boutique dans l'état du parcours demandé (plan
 * `plan-textes-de-la-boutique.md`, §5, §6, §10 B3).
 *
 * - **Hors cadre** (aucun parent, ou un parent dont l'origine n'est pas sur la
 *   liste) : il démarre l'écran « Cet aperçu s'ouvre depuis le back-office »,
 *   et ne fait RIEN d'autre — aucun écouteur, aucun message.
 * - **Ouvert par le back-office** (`window.opener`, la fenêtre détachée du
 *   2026-10-11) : même conversation, avec l'opener au lieu du parent. Son
 *   origine est illisible d'ici ; `ready` part donc à chacune des origines
 *   autorisées et le navigateur ne le livre qu'à la bonne. Sans `show` accepté
 *   dans {@link OPENER_GRACE_MS}, l'écran « hors cadre » s'affiche — un
 *   `show` tardif le remplace. Une largeur demandée redimensionne la fenêtre,
 *   si le navigateur le permet.
 * - **Édition en place** (2026-10-12, `copy-editing/`) : survol, clic sur un
 *   texte, frappe → `edit` ; `edit-refused` revient sous le champ.
 * - **Encadré** : il annonce `ready` au back-office, puis applique chaque
 *   `show`. Un changement de parcours REDÉMARRE la boutique — stockage vidé,
 *   injecteur neuf : un parcours ne garde rien du précédent. Un changement de
 *   textes, de langue ou de surbrillance s'applique à la boutique en place.
 *
 * Il n'envoie qu'aux origines du back-office, jamais à `'*'`.
 *
 * 🔴 **Ce qui protège une fenêtre ouverte, c'est la garde des messages, pas
 * l'en-tête.** `frame-ancestors` empêche un tiers de NOUS ENCADRER ; il ne
 * l'empêche pas de nous OUVRIR. Ce qui tient alors, et ne se relâche jamais :
 * la liste d'origines (on n'écrit qu'à elles, on ne lit que d'elles) et le
 * contrôle de l'émetteur (`event.source === window.opener`). De l'opener, on
 * n'utilise QUE `postMessage` : on ne le navigue pas, on ne le lit pas.
 */
export class PreviewHost {
  private readonly markers = new CopyMarkers();
  private app: ApplicationRef | null = null;
  /** La scène montée — `clientèle/étape` ; `null` avant la première. */
  private scene: string | null = null;
  /** L'origine du back-office qui nous parle, connue au premier `show` accepté. */
  private editorOrigin: string | null = null;
  /** Les `show` s'appliquent un par un ; seul le dernier reçu compte. */
  private queue: Promise<void> = Promise.resolve();
  private latest: ShopCopyPreviewShowMessage | null = null;
  private highlight: string | null = null;
  private lastKeys = '';
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  /** La fenêtre du back-office : le parent qui nous encadre, ou l'opener. */
  private editor: EditorWindow | null = null;
  private opened = false;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private windowViewport: ShopCopyPreviewShowMessage['viewport'] | null = null;
  /** La langue affichée — celle qu'un texte tapé en place déclare. */
  private locale: ShopCopyPreviewShowMessage['locale'] | null = null;
  /** L'édition en place — branchée seulement quand le back-office nous parle. */
  private editing: CopyEditing | null = null;

  constructor(
    private readonly win: Window,
    private readonly allowedOrigins: readonly string[],
    private readonly storages: PreviewStorages,
  ) {}

  /** Démarre : l'écran hors cadre, ou l'écoute du back-office. */
  async start(): Promise<void> {
    this.editor = this.findEditor();
    if (this.editor === null) {
      await bootstrapApplication(OutsideFrame);
      return;
    }
    this.win.addEventListener('message', (event) => this.receive(event));
    this.editing = new CopyEditing(
      this.win.document,
      this.markers,
      {
        pick: (key) => this.send(outbound({ type: 'pick', key })),
        edit: (key, locale, text) => this.send(outbound({ type: 'edit', key, locale, text })),
      },
      () => (this.app === null ? null : this.locale),
    );
    this.editing.listen();
    new MutationObserver(() => this.scheduleSettle()).observe(this.win.document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.send(outbound({ type: 'ready' }));
    if (this.opened) {
      this.graceTimer = setTimeout(() => {
        this.graceTimer = null;
        this.queue = this.queue.then(() => this.showOutside());
      }, OPENER_GRACE_MS);
    }
  }

  /** Personne ne nous a parlé à temps : l'écran « hors cadre », remplaçable par un `show`. */
  private async showOutside(): Promise<void> {
    if (this.app !== null) {
      return;
    }
    this.ensureRoot();
    this.app = await bootstrapApplication(OutsideFrame);
  }

  /** Le démarrage du parcours demandé, ou rien s'il tourne déjà. */
  private receive(event: MessageEvent): void {
    const refused = readEditRefusedMessage(event, this.allowedOrigins, this.editor);
    if (refused !== null) {
      this.editing?.refuse(refused.key, refused.reason);
      return;
    }
    const message = readShowMessage(event, this.allowedOrigins, this.editor);
    if (message === null) {
      return;
    }
    if (this.graceTimer !== null) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
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
    this.fitWindow(message.viewport);
    if (this.scene !== sceneOf(message) || this.app === null) {
      await this.remount(message);
    } else {
      this.applyCopy(message);
    }
  }

  /** Une scène neuve : la boutique précédente détruite, le stockage vidé, puis on rejoue. */
  private async remount(message: ShopCopyPreviewShowMessage): Promise<void> {
    this.app?.destroy();
    this.app = null;
    this.storages.local.clear();
    this.storages.session.clear();
    const journey = previewScene(message.audience, message.step);
    if (journey === null) {
      // La garde l'a déjà refusé ; rien à monter.
      return;
    }
    // L'adresse du parcours précédent ne doit pas monter son écran au démarrage.
    this.win.history.replaceState(null, '', '/');
    this.ensureRoot();
    const app = await bootstrapApplication(App, previewConfig(journey.world, this.markers));
    this.app = app;
    this.scene = sceneOf(message);
    // Les textes AVANT le parcours : le premier écran se dessine déjà avec eux.
    this.applyCopy(message);
    await journey.enter(app.injector);
  }

  /** Fenêtre détachée : la largeur simulée devient celle de la fenêtre, si le navigateur le permet. */
  private fitWindow(viewport: ShopCopyPreviewShowMessage['viewport']): void {
    if (!this.opened || this.windowViewport === viewport) {
      return;
    }
    this.windowViewport = viewport;
    try {
      this.win.resizeTo(WINDOW_WIDTHS[viewport], this.win.outerHeight);
    } catch {
      // Refusé par le navigateur (onglet, réglage) : la page s'adapte à la fenêtre telle qu'elle est.
    }
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
    this.locale = message.locale;
    this.highlight = message.highlight;
    this.scheduleSettle();
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
      this.editor?.postMessage(message, origin);
    }
  }

  /**
   * La fenêtre du back-office : le parent si on est encadré par lui, sinon
   * l'opener s'il y en a un — son origine ne se lit pas d'ici, la garde des
   * messages en décide. `null` : personne, l'écran « hors cadre ».
   */
  private findEditor(): EditorWindow | null {
    if (this.win.parent !== this.win) {
      return this.framedByEditor() ? this.win.parent : null;
    }
    const opener: unknown = this.win.opener;
    if (isEditorWindow(opener)) {
      this.opened = true;
      return opener;
    }
    return null;
  }

  /**
   * Encadrés par le back-office ? On lit l'origine du parent quand le navigateur la donne (`ancestorOrigins`) — elle devient
   * alors la seule destination ; sinon on la suppose — l'en-tête
   * `frame-ancestors` a déjà refusé tout autre encadrement, et la garde des
   * messages refuse tout autre émetteur.
   */
  private framedByEditor(): boolean {
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

function isEditorWindow(value: unknown): value is EditorWindow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'postMessage' in value &&
    typeof value.postMessage === 'function'
  );
}

/** L'identité d'une scène : changer de clientèle OU d'étape rejoue tout. */
function sceneOf(message: ShopCopyPreviewShowMessage): string {
  return `${message.audience}/${message.step}`;
}
