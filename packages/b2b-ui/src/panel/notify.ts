import { InjectionToken } from '@angular/core';

/**
 * Le **retour d'opération**, réduit à ce dont un panneau a besoin : ça a marché,
 * ou ça a échoué.
 *
 * C'est un port, et il existe pour une raison précise : chaque app a déjà son
 * `NotifyService`, bâti sur `FoldToastService` et sur le filtrage d'erreurs de
 * `@lfd/endpoints`. Ce paquet ne dépend ni de l'un ni de l'autre, et ne doit
 * pas commencer — il ne connaît que la présentation. Le token laisse chaque app
 * brancher le sien.
 *
 * Volontairement plus étroit que les services qui l'implémentent : ceux-ci
 * savent aussi dire `info` et `refused`. Un panneau qui enregistre n'en a pas
 * l'usage, et un port qui demande plus que nécessaire ferme la porte au
 * suivant.
 */
export interface LfdNotify {
  /** Opération réussie. */
  success(message: string): void;
  /** Opération échouée — le message sûr, jamais le détail interne. */
  error(error: unknown, fallback?: string): void;
}

/** Le service de retour d'opération de l'app hôte. */
export const LFD_NOTIFY = new InjectionToken<LfdNotify>('LFD_NOTIFY');
