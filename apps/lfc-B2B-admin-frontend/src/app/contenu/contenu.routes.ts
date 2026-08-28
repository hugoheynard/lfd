import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/**
 * Les routes du **Contenu de plateforme** — les textes de la vitrine.
 *
 * Même droit que les Réglages (`settings`), et c'est ce que l'API exige déjà :
 * éditer ce que lisent les clients est un geste de paramétrage, pas de
 * commerce. Un droit à part se justifiera le jour où quelqu'un devra pouvoir
 * corriger une coquille sans pouvoir toucher aux zones de livraison.
 */
export const contenuRoutes: Routes = [
  {
    path: 'contenu',
    canActivate: [permissionGuard('settings:read')],
    title: 'Contenu plateforme — LFC B2B admin',
    loadComponent: () => import('./contenu-page/contenu-page').then((m) => m.ContenuPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'app-layout' },
      {
        path: 'app-layout',
        title: 'App layout — LFC B2B admin',
        loadComponent: () => import('./app-layout/app-layout-page').then((m) => m.AppLayoutPage),
      },
    ],
  },
];
