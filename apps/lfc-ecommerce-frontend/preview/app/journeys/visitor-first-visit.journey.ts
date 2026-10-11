import { go } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { VISITOR_WORLD } from './visitor-world';

/** Visiteur, première visite : l'accueil, ses portes, le rail des maisons (§6). */
export const VISITOR_FIRST_VISIT: PreviewJourney = {
  id: 'visitor-first-visit',
  world: VISITOR_WORLD,
  enter: (injector) => go(injector, '/bienvenue'),
};
