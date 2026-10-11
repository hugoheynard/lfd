import { OrderDoors } from '../../../src/app/client/shop/order-doors';
import { go } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { VISITOR_WORLD } from './visitor-world';

/**
 * Visiteur, choix du lieu : le dialogue « où » ouvert sur l'accueil ; choisir
 * une maison y enchaîne « quand », comme dans la boutique (§6).
 */
export const VISITOR_CHOOSING_PLACE: PreviewJourney = {
  id: 'visitor-choosing-place',
  world: VISITOR_WORLD,
  enter: async (injector) => {
    await go(injector, '/bienvenue');
    // Pas d'attente : le dialogue rend la main quand on le ferme.
    void injector.get(OrderDoors).pickup(null);
  },
};
