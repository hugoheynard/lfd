/**
 * Les espaces des textes de la boutique, dans l’ordre et sous les titres du
 * recueil (`documentation/contenu-ecommerce/textes-de-la-boutique.md`) : le
 * parcours de commande d’abord, le reste ensuite.
 *
 * 🔴 RECOPIÉ de `dev-toolbox/shop-copy/spaces.mjs` le 2026-10-11 : l’écran
 * d’édition de l’API (`GET /admin/shop-copy`) range chaque clé dans son espace
 * mais ne porte ni titre ni ordre d’espace. Un espace que cette liste ne
 * connaît pas n’est pas perdu : il s’affiche sous son identifiant, après les
 * autres (cf. `space-tree.ts`). Le jour où l’API servira les titres, cette
 * liste disparaît.
 */
export interface ShopCopySpace {
  readonly space: string;
  readonly title: string;
  /** Sur le parcours de commande. */
  readonly journey: boolean;
}

export const SHOP_COPY_SPACES: readonly ShopCopySpace[] = [
  { space: 'accueilPublic', title: 'Accueil public — le visiteur sans compte', journey: true },
  { space: 'steps', title: 'Les trois étapes du parcours (où, quand, quoi)', journey: true },
  { space: 'hero', title: "Accueil — l'en-tête de bienvenue", journey: true },
  { space: 'doors', title: "Accueil — les portes d'entrée", journey: true },
  { space: 'event', title: "Accueil — la carte d'événement", journey: true },
  { space: 'signup', title: 'Connexion et création de compte', journey: true },
  { space: 'commande', title: "Commander — l'écran d'entrée de la commande", journey: true },
  { space: 'shop', title: 'Rayon / boutique', journey: true },
  { space: 'product', title: 'Rayon — la fiche produit', journey: true },
  {
    space: 'commandTerms',
    title: 'Barre de commande — la maison et l’heure retenues',
    journey: true,
  },
  { space: 'housePicker', title: 'Choix du lieu — la maison', journey: true },
  { space: 'dialog', title: 'Choix du lieu et de l’heure — le dialogue commun', journey: true },
  { space: 'pickupDialog', title: 'Choix du lieu — le retrait', journey: true },
  { space: 'addressDialog', title: 'Choix du lieu — l’adresse de livraison', journey: true },
  {
    space: 'deliveryAddress',
    title: 'Choix du lieu — la saisie d’une adresse de livraison',
    journey: true,
  },
  { space: 'slotPicker', title: 'Choix de l’heure — le sélecteur de créneau', journey: true },
  { space: 'slotStep', title: 'Choix de l’heure — l’étape du créneau', journey: true },
  { space: 'rappel', title: 'Choix de l’heure — le rappel téléphonique', journey: true },
  { space: 'cart', title: 'Panier, connexion et saisie invité', journey: true },
  { space: 'pay', title: 'Règlement', journey: true },
  { space: 'done', title: 'Confirmation', journey: true },
  { space: 'qr', title: 'Confirmation — le QR de retrait', journey: true },
  {
    space: 'chrome',
    title: 'Le cadre — bandeaux, installation, erreurs générales',
    journey: false,
  },
  { space: 'nav', title: 'La navigation', journey: false },
  { space: 'aside', title: 'La colonne d’accompagnement', journey: false },
  { space: 'orders', title: 'Mes commandes', journey: false },
  { space: 'loyalty', title: 'Fidélité', journey: false },
  { space: 'account', title: 'Mon compte (factures comprises)', journey: false },
  { space: 'pro', title: 'Le compte pro — le dictionnaire général', journey: false },
  { space: 'proAccount', title: 'Le compte pro — l’écran', journey: false },
  { space: 'deliveryProcedure', title: 'La procédure de livraison d’une adresse', journey: false },
  { space: 'contactDialog', title: 'Le dialogue « Nous écrire »', journey: false },
  { space: 'legalDocument', title: 'Les documents légaux', journey: false },
];
