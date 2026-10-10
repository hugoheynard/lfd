import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, PLATFORM_ID, signal } from '@angular/core';

import { readLocal, readNumber, writeLocal } from './local-store';

/**
 * Ce que le bandeau d'installation doit dire — un seul message par contexte
 * (`documentation/todos/todo-installation-app-cliente.md`).
 *
 * - `ios-safari` : le geste exact, Partager → Sur l'écran d'accueil ;
 * - `ios-other` : Chrome, Firefox, Edge sur iOS ne savent pas installer
 *   (habillages de WKWebView) — on renvoie vers Safari ;
 * - `prompt` : le navigateur a offert `beforeinstallprompt`, on le rejouera ;
 * - `none` : déjà installée, rendu serveur, ou rien à proposer.
 */
export type InstallContext = 'ios-safari' | 'ios-other' | 'prompt' | 'none';

/** Les faits du navigateur dont la détection dépend — rien d'autre. */
export interface InstallEnvironment {
  readonly userAgent: string;
  /** `display-mode: standalone`, ou `navigator.standalone` sur iOS. */
  readonly standalone: boolean;
  /** iPadOS se déclare « Macintosh » : seul l'écran tactile le trahit. */
  readonly maxTouchPoints: number;
  /** Un `beforeinstallprompt` a été capté et n'a pas encore servi. */
  readonly hasPromptEvent: boolean;
}

/** Les navigateurs iOS qui ne sont PAS Safari : tous déclarent WebKit. */
const IOS_NON_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//u;
const IOS_DEVICE = /iPhone|iPad|iPod/u;

export function isIos(env: Pick<InstallEnvironment, 'userAgent' | 'maxTouchPoints'>): boolean {
  return (
    IOS_DEVICE.test(env.userAgent) || (/Macintosh/u.test(env.userAgent) && env.maxTouchPoints > 1)
  );
}

/** Le reniflage, en fonction pure : c'est lui qu'on teste, pas le gabarit. */
export function detectInstallContext(env: InstallEnvironment): InstallContext {
  if (env.standalone) {
    return 'none';
  }
  if (isIos(env)) {
    return IOS_NON_SAFARI.test(env.userAgent) ? 'ios-other' : 'ios-safari';
  }
  return env.hasPromptEvent ? 'prompt' : 'none';
}

/** Un refus tient quatre semaines : au-delà, le rappel n'est plus une publicité. */
export const INSTALL_DISMISS_DURATION_MS = 28 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'install-dismissed-at';

export function isDismissalActive(dismissedAt: number | null, now: number): boolean {
  return dismissedAt !== null && now - dismissedAt < INSTALL_DISMISS_DURATION_MS;
}

/**
 * L'instant présent, en millisecondes.
 *
 * Le front n'a pas de port `Clock` (vérifié le 2026-10-10 : le panier lit
 * `new Date()` en direct, et `lint:clock-port` ne scanne que `apps/lfd-api`).
 * Ce jeton tient le même rôle pour ce seul usage : la mémoire du refus se gèle
 * en test sans toucher au mur.
 */
export const INSTALL_NOW = new InjectionToken<() => number>('INSTALL_NOW', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

/** L'événement non standard de Chromium — absent des types du DOM. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Capte `beforeinstallprompt` dès le démarrage et le rejoue à la demande.
 *
 * Chromium n'émet l'événement qu'une fois, tôt : un écouteur posé par le
 * bandeau, lui, arriverait trop tard. D'où `listen()` appelé par un
 * initialiseur d'application. Au rendu serveur, tout est inerte.
 */
@Injectable({ providedIn: 'root' })
export class InstallPrompt {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly now = inject(INSTALL_NOW);
  private readonly deferred = signal<BeforeInstallPromptEvent | null>(null);
  private listening = false;

  listen(): void {
    const view = this.document.defaultView;
    if (!this.isBrowser || view === null || this.listening) {
      return;
    }
    this.listening = true;
    view.addEventListener('beforeinstallprompt', (event) => {
      // Empêcher la mini-barre de Chrome : c'est le bandeau qui choisit le moment.
      event.preventDefault();
      this.deferred.set(event as BeforeInstallPromptEvent);
    });
    view.addEventListener('appinstalled', () => this.deferred.set(null));
  }

  /** Le contexte du moment ; `none` au rendu serveur. */
  context(): InstallContext {
    const view = this.document.defaultView;
    if (!this.isBrowser || view === null) {
      return 'none';
    }
    const nav = view.navigator as Navigator & { readonly standalone?: boolean };
    return detectInstallContext({
      userAgent: nav.userAgent,
      maxTouchPoints: nav.maxTouchPoints,
      standalone:
        nav.standalone === true || view.matchMedia?.('(display-mode: standalone)').matches === true,
      hasPromptEvent: this.deferred() !== null,
    });
  }

  /** Rejoue l'invite captée. L'événement ne sert qu'une fois. */
  async install(): Promise<void> {
    const event = this.deferred();
    if (event === null) {
      return;
    }
    this.deferred.set(null);
    await event.prompt();
  }

  isDismissed(): boolean {
    return isDismissalActive(readLocal(DISMISS_KEY, readNumber), this.now());
  }

  dismiss(): void {
    writeLocal(DISMISS_KEY, this.now());
  }
}
