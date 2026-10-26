import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import type { AccessibilityFollowUpView } from '@lfd/contracts';

import { AUTH_CONFIG } from '../auth/auth.config';

/** Où en est la lecture du suivi. */
export type AccessibilityFollowUpStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * **Le suivi des corrections d'accessibilité**, lu par le dialogue de la
 * déclaration (`GET /content/accessibility-follow-up`, Hugo, 2026-10-26).
 *
 * Seul le composant du suivi l'importe, et ce composant est différé dans le
 * dialogue : ce service part donc avec lui, pas au démarrage. Type seulement
 * depuis le baril des contrats — aucune valeur, donc aucun zod.
 *
 * Lu une fois, à la première ouverture, puis gardé ; une lecture ratée se
 * rejoue à l'ouverture suivante. Navigateur seulement : le rendu serveur n'a
 * pas à attendre un dialogue que personne n'a ouvert.
 */
@Injectable({ providedIn: 'root' })
export class ClientAccessibilityFollowUp {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<AccessibilityFollowUpStatus>('idle');
  private readonly view = signal<AccessibilityFollowUpView | null>(null);

  readonly status = this.state.asReadonly();
  readonly followUp = this.view.asReadonly();

  /** Charge le suivi s'il ne l'est pas, ou si la dernière lecture a échoué. */
  ensureLoaded(): void {
    const current = this.state();
    if (!this.isBrowser || current === 'loading' || current === 'ready') {
      return;
    }
    this.state.set('loading');
    this.http
      .get<AccessibilityFollowUpView>(`${AUTH_CONFIG.apiBaseUrl}/content/accessibility-follow-up`)
      .subscribe({
        next: (view) => {
          this.view.set(view);
          this.state.set('ready');
        },
        // Dit, pas avalé — mais discrètement : la déclaration reste lisible.
        error: () => this.state.set('failed'),
      });
  }
}
