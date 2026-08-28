import { type Route, type Routes } from '@angular/router';

import { authenticatedGuard } from './auth/authenticated.guard';
import { ClientShell } from './client/client-shell/client-shell';
import { FEATURE_DASHBOARD, FEATURE_PRO_SPACE } from './feature-flags';

/**
 * Accueil `/` : le tableau de bord quand son feature flag est actif, sinon une
 * simple redirection vers Boutique (le dashboard reste alors inaccessible en
 * direct — masqué, pas seulement retiré du menu).
 */
const homeRoute: Route = FEATURE_DASHBOARD
  ? {
      path: '',
      pathMatch: 'full',
      title: 'Tableau de bord — La Folie Coffee B2B',
      canActivate: [authenticatedGuard],
      loadComponent: () => import('./legacy/dashboard/dashboard-page').then((m) => m.DashboardPage),
    }
  : { path: '', pathMatch: 'full', redirectTo: 'boutique' };

/**
 * L'espace PRO hérité, derrière son drapeau.
 *
 * Les composants restent dans le dépôt et continuent de compiler ; ce sont leurs
 * ADRESSES qui disparaissent. Une route absente n'est pas une route protégée :
 * ce qui garde les données, c'est le garde d'authentification et le mur de la
 * société côté API — ici on ne fait que borner la navigation le temps de montrer
 * l'app cliente.
 */
const proRoutes: Routes = FEATURE_PRO_SPACE
  ? [
      {
        path: 'boutique',
        title: 'Boutique — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/boutique/boutique-page/boutique-page').then((m) => m.ShopPage),
      },
      homeRoute,
      {
        path: 'panier',
        title: 'Panier — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () => import('./legacy/cart/cart-page/cart-page').then((m) => m.CartPage),
      },
      {
        path: 'mes-paniers',
        title: 'Mes paniers — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/cart/saved-baskets-page/saved-baskets-page').then(
            (m) => m.SavedBasketsPage,
          ),
      },
      {
        path: 'mes-paniers/:id',
        title: 'Panier enregistré — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/cart/basket-detail-page/basket-detail-page').then(
            (m) => m.BasketDetailPage,
          ),
      },
      {
        path: 'commandes',
        title: 'Mes commandes — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/commandes/commandes-page/commandes-page').then((m) => m.CommandesPage),
      },
      {
        // AVANT `commandes/:id` : sans cela le segment `regler` serait lu comme la
        // suite d'un identifiant, et le lien de règlement ouvrirait le détail.
        path: 'commandes/:id/regler',
        title: 'Régler ma commande — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/commandes/reglement-page/reglement-page').then((m) => m.ReglementPage),
      },
      {
        path: 'commandes/:id',
        title: 'Commande — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/commandes/commande-page/commande-page').then((m) => m.CommandePage),
      },
      {
        path: 'entreprises',
        title: 'Mes entreprises — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/entreprises/entreprises-page/entreprises-page').then(
            (m) => m.EntreprisesPage,
          ),
      },
      {
        // « Mon profil » a été scindée : la personne est passée dans Réglages, les
        // sociétés dans « Mes entreprises ». La redirection garde les liens et
        // signets existants valides.
        path: 'profil',
        redirectTo: 'entreprises',
        pathMatch: 'full',
      },
      {
        path: 'reglages',
        title: 'Réglages — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () => import('./legacy/reglages/reglages-page').then((m) => m.ReglagesPage),
      },
    ]
  : [];

export const routes: Routes = [
  {
    // Seule route publique : la connexion. Toutes les autres passent le guard.
    path: 'login',
    title: 'Connexion — La Folie Coffee B2B',
    loadComponent: () => import('./login/login-page').then((m) => m.LoginPage),
  },
  {
    // Refonte de l'app CLIENT (handoff design). Route PARENTE : le shell client
    // (barre de marque bleue, pas de rail) enveloppe ses écrans, exactement
    // comme le shell pro enveloppe les siens. Si aucun enfant ne correspond, le
    // routeur revient en arrière et essaie les routes pro qui suivent.
    path: '',
    component: ClientShell,
    children: [
      {
        // LA RACINE : qui arrive sur le site tombe ici. Une redirection plutôt
        // qu'un doublon de route — l'écran garde une adresse à lui, qu'on peut
        // partager, et `/` ne devient pas un second nom pour la même chose.
        path: '',
        pathMatch: 'full',
        redirectTo: 'bienvenue',
      },
      {
        // La page d'entrée : inscription en trois champs, connexion par lien
        // e-mail, rappel commercial. Maquette — rien ne part sur le réseau, et
        // `/login` (Auth0) reste la porte réelle en attendant.
        path: 'bienvenue',
        title: 'Bienvenue — La Folie Coffee',
        loadComponent: () => import('./login/accueil-page/accueil-page').then((m) => m.AccueilPage),
      },
      {
        // L'ACCUEIL DU CLIENT RECONNU. Il répond à une seule question — qu'est-ce
        // qui m'attend aujourd'hui ? — et c'est là qu'on atterrit après la
        // connexion, sauf pendant le parcours de première commande, qui a sa
        // propre suite d'écrans.
        path: 'mon-espace',
        title: 'Mon espace — La Folie Coffee',
        loadComponent: () =>
          import('./client/espace/espace-page/espace-page').then((m) => m.EspacePage),
      },
      {
        // LE SUIVI, PUIS LA MÉMOIRE. Deux registres et l'ordre n'est pas
        // négociable : ce qui est en route d'abord, ce qui est passé ensuite.
        path: 'mes-commandes',
        title: 'Mes commandes — La Folie Coffee',
        loadComponent: () =>
          import('./client/commandes/commandes-page/commandes-page').then((m) => m.CommandesPage),
      },
      {
        // LE RELEVÉ, et l'écran le dit. La plateforme n'émet aucune facture :
        // elle rassemble les commandes telles qu'elles partent en comptabilité,
        // et le comptable dépose le PDF après la clôture.
        path: 'mes-factures',
        title: 'Mes factures — La Folie Coffee',
        loadComponent: () =>
          import('./client/factures/factures-page/factures-page').then((m) => m.FacturesPage),
      },
      {
        // LE DOSSIER, écrit pour celui qui le possède. Sept cartes et pas sept
        // écrans : le back-office a des onglets parce qu'un commercial y passe
        // la journée ; un client y passe deux fois par an.
        path: 'mon-compte',
        title: 'Mon compte — La Folie Coffee',
        loadComponent: () =>
          import('./client/compte/compte-page/compte-page').then((m) => m.ComptePage),
      },
      {
        // Le client reconnu : « On vous sert comment ? ». C'est la PREMIÈRE
        // question du parcours, avant le catalogue — ce qui est en stock, à
        // quelle heure et à quel prix dépend du mode de service.
        path: 'nouvelle-commande',
        title: 'Commander — La Folie Coffee',
        loadComponent: () =>
          import('./commande/commande-page/commande-page').then((m) => m.CommandePage),
      },
      {
        // LE RAYON. Il vit sous `commande/` et pas à la racine parce qu'il est la
        // SUITE d'une commande en cours : sans mode de service, il n'a rien à
        // montrer et renvoie à la question. `/boutique` reste la boutique PRO —
        // deux produits, deux catalogues, deux adresses.
        path: 'nouvelle-commande/boutique',
        title: 'Boutique — La Folie Coffee',
        loadComponent: () => import('./rayon/rayon-page/rayon-page').then((m) => m.RayonPage),
      },
      {
        path: 'nouvelle-commande/panier',
        title: 'Mon panier — La Folie Coffee',
        loadComponent: () => import('./rayon/panier-page/panier-page').then((m) => m.PanierPage),
      },
      {
        path: 'nouvelle-commande/confirmee',
        title: 'Commande confirmée — La Folie Coffee',
        loadComponent: () =>
          import('./rayon/confirmation-page/confirmation-page').then((m) => m.ConfirmationPage),
      },
      { path: 'connexion', pathMatch: 'full', redirectTo: 'bienvenue' },
      // Les anciennes adresses restent valides : un lien partagé ou un signet
      // pris avant le renommage doit continuer d'ouvrir le même écran.
      { path: 'commande', pathMatch: 'full', redirectTo: 'nouvelle-commande' },
      { path: 'commande/boutique', redirectTo: 'nouvelle-commande/boutique' },
      { path: 'commande/panier', redirectTo: 'nouvelle-commande/panier' },
      { path: 'commande/confirmee', redirectTo: 'nouvelle-commande/confirmee' },
    ],
  },
  ...proRoutes,
  { path: '**', redirectTo: '' },
];
