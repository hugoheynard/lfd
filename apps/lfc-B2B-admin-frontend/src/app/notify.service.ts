import { inject, Injectable, isDevMode } from '@angular/core';
import { FoldToastService } from 'fold-ng';
import { httpErrorMessage } from '@lfd/endpoints';

/**
 * Retours d'**opération** en toasts. Fine couche au-dessus de `FoldToastService` :
 * un succès affiche son message, un échec affiche le message **sûr** de
 * l'enveloppe d'API (`httpErrorMessage` — jamais un détail interne : le filtrage
 * est fait côté backend). En dev seulement, le détail complet part en console
 * pour le développeur — pas dans le toast, qui reste propre en prod.
 */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly toasts = inject(FoldToastService);

  /** Opération réussie. */
  success(message: string): void {
    this.toasts.show(message, 'success');
  }

  /** Information neutre. */
  info(message: string): void {
    this.toasts.show(message, 'info');
  }

  /**
   * Opération échouée : toast d'erreur (sticky par défaut) avec le message de
   * l'enveloppe API, ou `fallback`. Le détail brut ne va qu'en console de dev.
   */
  error(error: unknown, fallback?: string): void {
    if (isDevMode()) {
      console.error('[notify] opération échouée', error);
    }
    this.toasts.show(httpErrorMessage(error, fallback), 'error');
  }

  /**
   * Opération **refusée** — et l'utilisateur peut la corriger tout de suite :
   * un taux qui existe déjà, un nom en double. Même ton d'alerte que
   * {@link error}, mais le toast **s'efface** : la règle est comprise en une
   * lecture, et le geste suivant est la correction. Un bandeau collant à
   * refermer par-dessus serait une punition pour une faute de saisie.
   *
   * Sans risque pour la lisibilité : le compte à rebours de `fold-toast` se met
   * en pause tant que le pointeur ou le clavier est dessus (WCAG 2.2.1).
   */
  refused(error: unknown, fallback?: string): void {
    if (isDevMode()) {
      console.error('[notify] opération refusée', error);
    }
    this.toasts.show(httpErrorMessage(error, fallback), 'error', REFUSAL_MS);
  }
}

/** De quoi lire une phrase sans se presser, sans rester en travers de l'écran. */
const REFUSAL_MS = 6000;
