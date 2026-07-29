import { type Routes } from '@angular/router';

import { authenticatedGuard } from './auth/authenticated.guard';

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
  {
    path: '',
    pathMatch: 'full',
    title: 'Tableau de bord — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'commandes',
    title: 'Mes commandes — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./commandes/commandes-page').then((m) => m.CommandesPage),
  },
  {
    path: 'profil',
    title: 'Mon profil — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./profil/profil-page').then((m) => m.ProfilPage),
  },
  {
    path: 'reglages',
    title: 'Réglages — La Folie Coffee B2B',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./reglages/reglages-page').then((m) => m.ReglagesPage),
  },
  { path: '**', redirectTo: '' },
];
