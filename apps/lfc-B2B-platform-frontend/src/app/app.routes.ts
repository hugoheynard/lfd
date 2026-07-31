import { type Route, type Routes } from '@angular/router';

import { authenticatedGuard } from './auth/authenticated.guard';
import { FEATURE_DASHBOARD } from './feature-flags';

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
      loadComponent: () => import('./dashboard/dashboard-page').then((m) => m.DashboardPage),
    }
  : { path: '', pathMatch: 'full', redirectTo: 'boutique' };

export const routes: Routes = [
  {
    // Seule route publique : la connexion. Toutes les autres passent le guard.
    path: 'login',
    title: 'Connexion — La Folie Coffee B2B',
    loadComponent: () => import('./login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'boutique',
    title: 'Boutique — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./boutique/boutique-page').then((m) => m.BoutiquePage),
  },
  homeRoute,
  {
    path: 'panier',
    title: 'Panier — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./cart/cart-page/cart-page').then((m) => m.CartPage),
  },
  {
    path: 'mes-paniers',
    title: 'Mes paniers — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./cart/saved-baskets-page/saved-baskets-page').then((m) => m.SavedBasketsPage),
  },
  {
    path: 'mes-paniers/:id',
    title: 'Panier enregistré — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./cart/basket-detail-page/basket-detail-page').then((m) => m.BasketDetailPage),
  },
  {
    path: 'commandes',
    title: 'Mes commandes — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./commandes/commandes-page').then((m) => m.CommandesPage),
  },
  {
    path: 'entreprises',
    title: 'Mes entreprises — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./entreprises/entreprises-page').then((m) => m.EntreprisesPage),
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
    loadComponent: () => import('./reglages/reglages-page').then((m) => m.ReglagesPage),
  },
  { path: '**', redirectTo: '' },
];
