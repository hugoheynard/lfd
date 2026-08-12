import { DestroyRef, inject, signal, type Signal } from '@angular/core';

/**
 * Le seuil « étroit » du back-office — le même que celui des retraits resserrés
 * de fold-ng, pour qu'un écran ne bascule pas en deux temps.
 */
const NARROW = '(max-width: 640px)';

/**
 * L'écran est-il étroit, **en direct** ?
 *
 * Certains réglages ne sont pas du CSS et ne peuvent donc pas vivre dans une
 * media query : la densité d'une barre `fold-view-nav` est une *entrée* du
 * composant, et l'encapsulation de vue met ses paddings hors de portée d'une
 * feuille d'app. Il faut donc que le TypeScript sache la largeur.
 *
 * Vivant plutôt que lu une fois : on tourne un téléphone, on ouvre un panneau,
 * on redimensionne une fenêtre. Un `isHandheld()` figé à la construction (comme
 * la carte d'identité, où la question est « cet appareil a-t-il une caméra »)
 * répondrait faux au premier quart de tour.
 *
 * Sans `matchMedia` — rendu serveur, environnement de test — on répond **non** :
 * le rendu large est le défaut, et l'hydratation corrige.
 */
export function narrowViewport(): Signal<boolean> {
  const narrow = signal(false);
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return narrow.asReadonly();
  }
  const query = window.matchMedia(NARROW);
  narrow.set(query.matches);
  const onChange = (event: MediaQueryListEvent): void => narrow.set(event.matches);
  query.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  return narrow.asReadonly();
}
