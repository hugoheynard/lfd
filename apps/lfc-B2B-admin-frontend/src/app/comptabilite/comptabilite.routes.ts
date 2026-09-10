import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/**
 * Les routes de l'**espace Comptabilité**.
 *
 * Un seul droit à l'entrée (`b2b_accounting:read`) et pas de garde par vue :
 * contrairement à l'Admin, dont les écrans relèvent de deux murs différents,
 * tout ce qui vit ici relève du même — l'identité d'émetteur, ses coordonnées,
 * et bientôt ses factures. Le jour où une vue demandera autre chose, elle
 * portera son `canActivate` comme l'Admin le fait déjà.
 */
export const comptabiliteRoutes: Routes = [
  {
    path: 'comptabilite',
    canActivate: [permissionGuard('b2b_accounting:read')],
    title: 'Comptabilité — LFC B2B admin',
    loadComponent: () =>
      import('./comptabilite-page/comptabilite-page').then((m) => m.ComptabilitePage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'entites-juridiques' },
      {
        path: 'entites-juridiques',
        title: 'Entités juridiques — LFC B2B admin',
        loadComponent: () =>
          import('./entites-juridiques/entites-juridiques-page').then(
            (m) => m.EntitesJuridiquesPage,
          ),
      },
    ],
  },
];
