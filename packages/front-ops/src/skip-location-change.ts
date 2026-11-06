import { NavigationStart, type Router } from "@angular/router";

/**
 * Retient, par navigation, si elle a été demandée sans toucher à l'adresse
 * (`skipLocationChange`).
 *
 * Le routeur ne le porte sur aucun de ses événements, et sa navigation
 * courante est déjà effacée quand `NavigationError` sort : on le note donc au
 * départ (`NavigationStart`, la navigation courante est alors posée) et on le
 * relit à la fin par l'identifiant de la navigation. Seule la dernière compte
 * — une navigation remplacée ne rend plus d'événement utile.
 */
export function trackSkipLocationChange(router: Router): (navigationId: number) => boolean {
  let last: { readonly id: number; readonly skip: boolean } | null = null;
  router.events.subscribe((event) => {
    if (event instanceof NavigationStart) {
      last = {
        id: event.id,
        skip: router.currentNavigation()?.extras.skipLocationChange === true,
      };
    }
  });
  return (navigationId) => last !== null && last.id === navigationId && last.skip;
}
