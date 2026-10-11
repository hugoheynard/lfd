import type { ShopCopyPreviewJourney } from '@lfd/contracts/shop-copy-preview';

/** Les parcours de l'aperçu (plan §6), dits comme on les raconte. */
export const JOURNEY_LABELS: Readonly<Record<ShopCopyPreviewJourney, string>> = {
  'visitor-first-visit': 'Visiteur — première visite',
  'visitor-choosing-place': 'Visiteur — choisit le lieu et l’heure',
  'visitor-cart-without-place': 'Visiteur — panier sans lieu choisi',
  'visitor-ready-to-pay': 'Visiteur — prêt à régler',
  'visitor-confirmation': 'Visiteur — commande confirmée',
  'customer-signed-in': 'Client connecté',
  'pro-on-account': 'Client pro — en compte',
  'shop-closed': 'Boutique fermée',
};
