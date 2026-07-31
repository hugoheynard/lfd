import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import {
  isHostMessage,
  SUITE_CHANNEL,
  type EmbedMessage,
  type HostMessage,
} from '@lfd/suite-embed';

/** Délai max d'attente d'un token relayé par le shell. */
const TOKEN_TIMEOUT_MS = 10_000;

/**
 * Client **embed** de l'app : gère la vie embarquée dans le shell (iframe).
 *
 * - `hosted` : vrai si l'app tourne dans un cadre (`window.self !== window.top`).
 * - à `init()` (seulement si hosted) : envoie `hello`, **reflète** ses changements
 *   de route vers le parent, et **écoute** les demandes de navigation du parent
 *   (back/forward) pour naviguer sans reload.
 * - `requestToken(audience)` : demande au shell un access token (auth cross-frame).
 *
 * Sécurité : l'origine du shell est lue depuis `?suiteHost=` (posé par le shell
 * dans l'URL de l'iframe) ; on n'accepte QUE les messages de cette origine, et on
 * ne poste QUE vers elle (jamais `*`).
 */
@Injectable({ providedIn: 'root' })
export class SuiteEmbed {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly win = this.document.defaultView;
  /** Embarquée dans un cadre d'une autre origine. */
  readonly hosted = this.detectHosted();
  /** Origine du shell (validée), ou null hors contexte hosté. */
  private readonly hostOrigin = this.readHostOrigin();

  private requestCounter = 0;
  private readonly pending = new Map<string, (token: string | null) => void>();

  /** À appeler au boot. No-op hors contexte embarqué. */
  init(): void {
    if (!this.active()) {
      return;
    }
    this.win?.addEventListener('message', (event: MessageEvent) => this.onHostMessage(event));
    this.send({ channel: SUITE_CHANNEL, kind: 'hello' });
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.send({ channel: SUITE_CHANNEL, kind: 'route', path: this.currentPath() }));
  }

  /** Access token pour `audience` via le shell ; `null` si hors contexte / timeout. */
  requestToken(audience: string): Promise<string | null> {
    if (!this.active()) {
      return Promise.resolve(null);
    }
    const requestId = `req-${(this.requestCounter += 1)}`;
    return new Promise<string | null>((resolve) => {
      this.pending.set(requestId, resolve);
      this.send({ channel: SUITE_CHANNEL, kind: 'token-request', requestId, audience });
      this.win?.setTimeout(() => {
        if (this.pending.delete(requestId)) {
          resolve(null);
        }
      }, TOKEN_TIMEOUT_MS);
    });
  }

  private onHostMessage(event: MessageEvent): void {
    if (event.origin !== this.hostOrigin || !isHostMessage(event.data)) {
      return;
    }
    const message: HostMessage = event.data;
    if (message.kind === 'navigate') {
      void this.router.navigateByUrl(`/${message.path}`);
      return;
    }
    const resolve = this.pending.get(message.requestId);
    if (resolve) {
      this.pending.delete(message.requestId);
      resolve(message.token);
    }
  }

  private send(message: EmbedMessage): void {
    if (this.hostOrigin) {
      this.win?.parent.postMessage(message, this.hostOrigin);
    }
  }

  private active(): boolean {
    return this.hosted && this.hostOrigin !== null && this.win !== null;
  }

  private detectHosted(): boolean {
    return this.win !== null && this.win.self !== this.win.top;
  }

  /** Origine du shell depuis `?suiteHost=` ; null si absente/invalide. */
  private readHostOrigin(): string | null {
    if (!this.win) {
      return null;
    }
    const raw = new URLSearchParams(this.win.location.search).get('suiteHost');
    if (!raw) {
      return null;
    }
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  }

  private currentPath(): string {
    return this.router.url.replace(/^\/+/, '').split('?')[0] ?? '';
  }
}
