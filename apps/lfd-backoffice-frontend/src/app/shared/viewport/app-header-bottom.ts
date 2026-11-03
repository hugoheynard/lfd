import { DestroyRef, inject } from '@angular/core';

/** La variable que la feuille globale lit (`styles.scss`, feuilles du bas). */
export const APP_HEADER_BOTTOM_VAR = '--lfd-app-header-bottom';

/**
 * **Publie le bas de la barre de l'app** sur `<html>`, en px, et le tient à
 * jour — pour que les feuilles du bas de fold montent jusqu'à elle.
 *
 * Mesuré plutôt que lu : les jetons de chrome de fold
 * (`--fold-shell-header-height`) valent `""` hors du shell, et le panneau de
 * fold est monté hors de sa portée (vu au prévisionnel et au comptoir le
 * 2026-11-03). La boutique fait la même chose avec une hauteur fixe ; ici la
 * barre change de hauteur avec le fil d'en-tête et le téléphone.
 *
 * À appeler une fois, dans un contexte d'injection (le constructeur de l'app).
 */
export function publishAppHeaderBottom(): void {
  if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') {
    return;
  }
  const root = document.documentElement;
  let observed: Element | null = null;
  const measure = (): void => {
    const header = document.querySelector('fold-app-shell > header');
    if (header === null) {
      return;
    }
    if (header !== observed) {
      observer.disconnect();
      observer.observe(header);
      observed = header;
    }
    root.style.setProperty(
      APP_HEADER_BOTTOM_VAR,
      `${String(Math.round(header.getBoundingClientRect().bottom))}px`,
    );
  };
  const observer = new ResizeObserver(measure);
  // La barre n'existe qu'une fois le shell rendu : on la cherche à chaque
  // redimensionnement de la fenêtre, et une fois au premier rendu.
  window.addEventListener('resize', measure);
  requestAnimationFrame(measure);
  inject(DestroyRef).onDestroy(() => {
    observer.disconnect();
    window.removeEventListener('resize', measure);
  });
}
