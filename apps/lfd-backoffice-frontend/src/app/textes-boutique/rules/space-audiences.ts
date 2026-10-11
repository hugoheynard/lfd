import type { ShopCopyAudience } from '@lfd/contracts/shop-copy-preview';

/**
 * **Qui voit quel espace** — la correspondance espace → clientèles, LUE dans
 * le code de la boutique le 2026-10-11 (`app.routes.ts` et ses gardes,
 * `recognised()` du cadre, `companyWorkspaceGuard`, `personalWorkspaceGuard`,
 * `FEATURE_PRO_SPACE = false`) en cherchant les lecteurs de chaque espace.
 *
 * Une liste VIDE dit « personne aujourd'hui » : l'espace reste éditable, sous
 * « Pas montré aujourd'hui ». Ces affirmations parlent d'un autre dépôt et
 * d'une date : un écran qui change de garde les rend fausses sans que rien
 * ne rougisse ici, sauf un espace nouveau (cf. la spec).
 */
const V: ShopCopyAudience = 'visitor';
const P: ShopCopyAudience = 'personal';
const R: ShopCopyAudience = 'pro';
const ALL = [V, P, R] as const;

export const SPACE_AUDIENCES: Readonly<Record<string, readonly ShopCopyAudience[]>> = {
  // `/bienvenue`, sans garde : l'accueil des trois états (visiteur, perso, `pro()`).
  accueilPublic: ALL,
  // `public-steps`, posé sur l'accueil pour tous (avec `[pro]`).
  steps: ALL,
  // Dictionnaire lu par `/inscription` et son rappel : qui n'est pas connecté.
  hero: [V],
  // Dictionnaire lu par l'inscription, la connexion par code et ses refus.
  doors: [V],
  // `current-events`, sur l'accueil : pour tous.
  event: ALL,
  // L'écran de connexion et l'inscription : hors compte, par définition.
  signup: [V],
  // Aucun lecteur dans `src/app` (vérifié le 2026-10-11).
  commande: [],
  // `/boutique`, sans garde : le rayon se visite à tous les niveaux.
  shop: ALL,
  product: ALL,
  // `order-bar` et `cart-bar` : la barre du rayon et du panier.
  commandTerms: ALL,
  // `OrderDoors.pickup` : le dialogue « où », depuis l'accueil comme le panier.
  housePicker: ALL,
  // Le cadre commun des dialogues « où »/« quand » et des panneaux du compte.
  dialog: ALL,
  // Lu par la barre de commande, le choix de maison et l'accueil.
  pickupDialog: ALL,
  // Aucun lecteur dans `src/app` (vérifié le 2026-10-11).
  addressDialog: [],
  // `OrderDoors.delivery` : la porte du coursier, ouverte aux deux clientèles.
  deliveryAddress: ALL,
  // `OrderDoors.time` : le dialogue « quand ».
  slotPicker: ALL,
  // Aucun lecteur dans `src/app` (vérifié le 2026-10-11).
  slotStep: [],
  // Le rappel de l'inscription : qui n'a pas de compte.
  rappel: [V],
  // Le panier, sa saisie invité et sa connexion : tout le monde commande.
  cart: ALL,
  // `/reglement/:id`, sans garde : l'invité règle comme le client.
  pay: ALL,
  // `/confirmation-de-commande`, sans garde.
  done: ALL,
  // `/mes-commandes/retrait/:id`, sans garde : le QR se rouvre depuis un lien.
  qr: ALL,
  // Le cadre (`client-shell`, bandeau d'installation) : partout.
  chrome: ALL,
  // Le menu, la pastille du panier, le menu de la personne.
  nav: ALL,
  // La colonne de l'inscription : hors compte.
  aside: [V],
  // Le suivi de l'accueil n'apparaît qu'à qui est reconnu, « Mes commandes » aussi.
  orders: [P, R],
  // `/ma-fidelite` : `personalWorkspaceGuard` — pas de fidélité en pro.
  loyalty: [P],
  // `/mon-compte` : `companyWorkspaceGuard` — le dossier de la société.
  account: [R],
  // `callback-block`, sur la porte pro de l'inscription.
  pro: [V],
  // La porte pro de l'inscription, et la carte du dossier de `/mon-compte`.
  proAccount: [V, R],
  // Le carnet d'adresses de `/mon-compte` : la société.
  deliveryProcedure: [R],
  // « Nous écrire » / « Nous appeler » : bande de contact de l'accueil, pied de page.
  contactDialog: ALL,
  // Les documents légaux, ouverts depuis le pied de page du cadre.
  legalDocument: ALL,
};

/** Les clientèles qui voient un espace ; `[]` pour un espace inconnu ou que personne ne voit. */
export function audiencesOf(space: string): readonly ShopCopyAudience[] {
  return Object.hasOwn(SPACE_AUDIENCES, space) ? (SPACE_AUDIENCES[space] ?? []) : [];
}

/** Cette clientèle voit-elle cet espace ? */
export function isSeenBy(space: string, audience: ShopCopyAudience): boolean {
  return audiencesOf(space).includes(audience);
}

/** Un espace que personne ne voit aujourd'hui — « Pas montré aujourd'hui ». */
export function isUnshown(space: string): boolean {
  return audiencesOf(space).length === 0;
}
