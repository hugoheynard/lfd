import type { CanDeactivateFn } from '@angular/router';

/** Un composant qui sait dire s'il peut être quitté (changements non enregistrés). */
export interface HasPendingChanges {
  canLeave(): boolean;
}

/**
 * Garde de navigation : bloque la sortie quand le composant a des changements en
 * attente. `canLeave()` renvoie `false` pour retenir (et afficher sa propre
 * bannière) ; `true` pour laisser partir. Intercepte back-link, bouton
 * navigateur et navigations router — là où un `(click)` ne le peut pas.
 */
export const pendingChangesGuard: CanDeactivateFn<HasPendingChanges> = (component) =>
  component.canLeave();
