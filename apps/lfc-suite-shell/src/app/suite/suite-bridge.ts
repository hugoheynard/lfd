import { DOCUMENT, Location } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import { AuthFacade } from '../auth/auth.facade';
import { SUITE_AUTH_CONFIG, type SuiteAudience } from '../auth/auth.config';
import { SUITE_APPS } from './suite-registry';
import { appUrlFor, SUITE_ALLOWED_ORIGINS } from './suite-app';
import type { SuiteAppEntry } from './suite-app';
import {
  isEmbedMessage,
  SUITE_CHANNEL,
  type EmbedMessage,
  type HostMessage,
} from './embed-protocol';

/** Une frame embarquée connue (établie via un message entrant). */
interface KnownFrame {
  readonly win: WindowProxy;
  readonly origin: string;
  readonly app: SuiteAppEntry;
}

/**
 * **Bridge postMessage** du shell (host). Point unique de communication avec les
 * apps embarquées. Sécurité :
 * - ne traite QUE les messages dont `event.origin` ∈ allowlist (dérivée des URLs
 *   d'apps) ET conformes au protocole (`isEmbedMessage`) ;
 * - répond en **ciblant l'origine émettrice** (jamais `*`) ;
 * - ne délivre un token que pour une **audience connue**, et jamais de détail
 *   d'erreur (token `null` en cas d'échec).
 *
 * Rôles : relais de token (auth cross-frame) + reflet de l'URL interne de l'app
 * dans l'URL parent (`route`), et navigation descendante (`notifyNavigate`, pour
 * le back/forward du parent) — sans jamais recharger l'iframe.
 */
@Injectable({ providedIn: 'root' })
export class SuiteBridge {
  private readonly document = inject(DOCUMENT);
  private readonly location = inject(Location);
  // AuthFacade est le SEUL propriétaire d'Auth0 (cf. sa doc) : injection normale,
  // singleton partagé avec le gate de `App` — pas de 2ᵉ résolution d'AuthService.
  private readonly auth = inject(AuthFacade);

  /** origine → app déclarée (résolue depuis le registre + les URLs). */
  private readonly appByOrigin = this.buildOriginIndex();
  /** dernières frames vues, par id d'app (pour la nav descendante). */
  private readonly frames = new Map<string, KnownFrame>();
  private started = false;

  /** Installe l'écouteur global. Idempotent. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const win = this.document.defaultView;
    if (!win) {
      return;
    }
    win.addEventListener('message', (event: MessageEvent) => {
      void this.onMessage(event);
    });
  }

  /**
   * Demande à l'app `appId` de naviguer vers `path` (sans reload). No-op si la
   * frame n'est pas (encore) connue. Utilisé sur back/forward du parent.
   */
  notifyNavigate(appId: string, path: string): void {
    const frame = this.frames.get(appId);
    if (!frame) {
      return;
    }
    this.post(frame, { channel: SUITE_CHANNEL, kind: 'navigate', path });
  }

  private async onMessage(event: MessageEvent): Promise<void> {
    // 1) Mur d'origine + conformité protocole — tout le reste est ignoré.
    if (!SUITE_ALLOWED_ORIGINS.has(event.origin) || !isEmbedMessage(event.data)) {
      return;
    }
    const app = this.appByOrigin.get(event.origin);
    const source = event.source;
    if (!app || !source || !('postMessage' in source)) {
      return;
    }
    const frame: KnownFrame = { win: source as WindowProxy, origin: event.origin, app };
    this.frames.set(app.id, frame);

    const message = event.data as EmbedMessage;
    switch (message.kind) {
      case 'hello':
        return; // établissement seul (frame mémorisée ci-dessus).
      case 'route':
        this.reflectRoute(app, message.path);
        return;
      case 'token-request':
        await this.replyToken(frame, message.requestId, message.audience);
        return;
    }
  }

  /** Reflète le chemin interne de l'app dans l'URL parent (sans nav router). */
  private reflectRoute(app: SuiteAppEntry, rawPath: string): void {
    const clean = rawPath.replace(/^\/+/, '');
    const url = clean ? `/${app.routePath}/${clean}` : `/${app.routePath}`;
    this.location.replaceState(url);
  }

  /** Répond à une demande de token. Audience inconnue ⇒ `null`. */
  private async replyToken(frame: KnownFrame, requestId: string, audience: string): Promise<void> {
    const token = await this.resolveToken(audience);
    this.post(frame, { channel: SUITE_CHANNEL, kind: 'token', requestId, token });
  }

  private async resolveToken(audience: string): Promise<string | null> {
    if (!this.isKnownAudience(audience) || !this.auth.isAuthenticated()) {
      return null;
    }
    try {
      return await this.auth.getToken(audience);
    } catch {
      return null;
    }
  }

  private isKnownAudience(audience: string): audience is SuiteAudience {
    return Object.prototype.hasOwnProperty.call(SUITE_AUTH_CONFIG.audiences, audience);
  }

  private post(frame: KnownFrame, message: HostMessage): void {
    frame.win.postMessage(message, frame.origin);
  }

  private buildOriginIndex(): ReadonlyMap<string, SuiteAppEntry> {
    const index = new Map<string, SuiteAppEntry>();
    for (const app of SUITE_APPS) {
      const url = appUrlFor(app.id);
      if (!url) {
        continue;
      }
      try {
        index.set(new URL(url).origin, app);
      } catch {
        // URL invalide en config : l'app reste stub, pas d'entrée d'origine.
      }
    }
    return index;
  }
}
