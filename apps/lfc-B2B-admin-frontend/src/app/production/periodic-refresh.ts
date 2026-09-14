import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, PLATFORM_ID } from '@angular/core';

/**
 * **La relecture des postes du fournil.**
 *
 * Partagée par la fiche d'atelier et le poste de colisage. Pourquoi une relecture
 * et pas une websocket, et ce qu'il faudrait pour passer à la seconde :
 * `documentation/production/relecture-des-postes.md`.
 */

/**
 * Tous les combien un poste visible se relit.
 *
 * 15 s : le temps qu'un fournil met à sortir une plaque et revenir à l'écran.
 * Plus court n'apporterait rien qu'on puisse voir ; plus long laisserait deux
 * postes cocher la même ligne à la main. La fiche et le colisage tiennent en
 * quelques dizaines de lignes : une relecture coûte deux lectures au pire.
 */
export const REFRESH_INTERVAL_MS = 15_000;

/**
 * Relit **tant que l'onglet est visible**, et **tout de suite** quand on y revient.
 *
 * - Un onglet caché ne relit pas : un poste oublié derrière une autre fenêtre ne
 *   doit pas interroger le serveur toute la nuit pour personne.
 * - Revenir sur l'onglet relit sans attendre : un écran retrouvé après deux
 *   heures ne doit pas montrer quinze secondes de périmé à qui s'y fie.
 * - Jamais deux relectures en même temps : sur un réseau de sous-sol, une
 *   lecture peut durer plus qu'un intervalle.
 *
 * ⚠️ À appeler dans un contexte d'injection (le constructeur) : l'arrêt est
 * attaché au `DestroyRef` de l'écran, et un intervalle qui survivrait à l'écran
 * relirait une fiche que plus personne ne regarde.
 *
 * `refresh` porte ses propres échecs — il les DIT à l'écran. Il ne doit pas
 * rejeter ; s'il le fait, c'est un défaut, et il remonte au lieu d'être avalé.
 */
export function refreshWhileVisible(
  refresh: () => Promise<void>,
  intervalMs: number = REFRESH_INTERVAL_MS,
): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return;
  }
  const destroyRef = inject(DestroyRef);
  let running = false;
  const tick = (): void => {
    if (running || document.visibilityState !== 'visible') {
      return;
    }
    running = true;
    void refresh().finally(() => {
      running = false;
    });
  };
  const timer = setInterval(tick, intervalMs);
  document.addEventListener('visibilitychange', tick);
  destroyRef.onDestroy(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', tick);
  });
}
