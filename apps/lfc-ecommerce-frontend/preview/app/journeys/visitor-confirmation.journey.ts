import { ClientOrders } from '../../../src/app/client/client-orders.service';
import { DEMO_PAYMENT } from '../demo-data/demo-payment';
import { chooseLabTomorrow, fillCart, go, settleCart } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { VISITOR_WORLD } from './visitor-world';

/** Les points que la commande aurait rapportés avec un compte, et le bonus de bienvenue. */
const POINTS_WITH_ACCOUNT = 12;
const WELCOME_BONUS = 50;

/**
 * Visiteur, confirmation : la commande passée PAR LE VRAI CHEMIN — panier,
 * lieu, saisie invité, passation (simulée), paiement accepté — puis la
 * confirmation, avec les points qu'un compte aurait gagnés et le bonus (§6).
 */
export const VISITOR_CONFIRMATION: PreviewJourney = {
  id: 'visitor-confirmation',
  world: {
    ...VISITOR_WORLD,
    placement: {
      payment: DEMO_PAYMENT,
      loyaltyPointsWithAccount: POINTS_WITH_ACCOUNT,
      welcomeBonusPoints: WELCOME_BONUS,
    },
  },
  enter: async (injector) => {
    await fillCart(injector);
    chooseLabTomorrow(injector);
    await go(injector, '/boutique');
    await settleCart(injector);
    const orders = injector.get(ClientOrders);
    const order = await orders.placeAsGuest({
      firstName: 'Camille',
      email: 'camille@apercu.invalid',
      phone: '06 00 00 00 00',
    });
    if (order !== null) {
      orders.markPaid(order.id);
    }
    await go(injector, '/confirmation-de-commande');
  },
};
