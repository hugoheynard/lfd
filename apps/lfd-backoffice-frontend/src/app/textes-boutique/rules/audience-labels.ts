import type {
  ShopCopyAudience,
  ShopCopyOrderStep,
  ShopCopyOutsideScreen,
} from '@lfd/contracts/shop-copy-preview';

/** Les clientèles, dites comme au comptoir. */
export const AUDIENCE_LABELS: Readonly<Record<ShopCopyAudience, string>> = {
  visitor: 'Non connecté',
  personal: 'Particulier',
  pro: 'Pro',
};

/** Ce que voit chaque clientèle — la phrase d'aide sous le sélecteur. */
export const AUDIENCE_HELP: Readonly<Record<ShopCopyAudience, string>> = {
  visitor:
    'Ce que voit quelqu’un qui n’est pas connecté : l’accueil, le rayon, le panier et la commande en invité.',
  personal:
    'Ce que voit un particulier connecté : l’accueil, le rayon, le panier, le règlement, ses commandes et sa fidélité.',
  pro: 'Ce que voit un pro dans l’espace de sa société : les prix HT, la commande au compte, ses commandes et le compte de la société.',
};

/** Les sept étapes, numérotées comme sur la frise. */
export const ORDER_STEP_LABELS: Readonly<Record<ShopCopyOrderStep, string>> = {
  welcome: '1 Bienvenue',
  routing: '2 Acheminement',
  time: '3 Horaire',
  shop: '4 Boutique',
  cart: '5 Mon panier',
  payment: '6 Paiement',
  confirmation: '7 Confirmation',
};

/** Les écrans hors commande. */
export const OUTSIDE_SCREEN_LABELS: Readonly<Record<ShopCopyOutsideScreen, string>> = {
  orders: 'Mes commandes',
  loyalty: 'Fidélité',
  account: 'Mon compte',
};

/**
 * Ce que l'aperçu montre à une étape quand ce n'est pas ce que son nom promet
 * — dit à côté de la frise, pour qu'on ne cherche pas un écran qui n'existe pas.
 */
export function stepNote(audience: ShopCopyAudience, step: string): string | null {
  if (audience === 'pro' && step === 'payment') {
    return 'Pas d’étape de paiement au compte : la commande passe droit à la confirmation. L’aperçu montre ici le règlement par carte d’un pro.';
  }
  if (audience === 'pro' && step === 'time') {
    return 'Une livraison n’a pas de grille d’heures : l’aperçu montre le créneau d’un retrait.';
  }
  return null;
}
