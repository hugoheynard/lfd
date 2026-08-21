import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/**
 * Les routes du **dossier client** — la fiche et sa création.
 *
 * Deux fragments et non un seul, parce que leur ORDRE dans l'assemblage porte
 * une garantie : `comptes-clients/nouveau` doit passer avant
 * `comptes-clients/:id`, et `comptes-clients/:id/nouvelle-commande` avant lui
 * aussi. Les réunir en un bloc les déplacerait ensemble et casserait la
 * seconde. Voir `app.routes.ts`, qui tient l'ordre.
 */
export const nouveauCompteRoutes: Routes = [
  {
    // AVANT `comptes-clients/:id` : sans cela « nouveau » serait lu comme un
    // identifiant de société, et la page afficherait « Société introuvable ».
    path: 'comptes-clients/nouveau',
    canActivate: [permissionGuard('companies:write')],
    title: 'Nouveau compte client — LFC B2B admin',
    loadComponent: () => import('./nouveau-compte-shell').then((m) => m.NouveauCompteShell),
  },
];

export const ficheClientRoutes: Routes = [
  {
    // Un compte se regarde de cinq façons qui n'ont pas les mêmes lecteurs : le
    // tableau de bord (avant d'appeler), les informations (pour corriger), les
    // commandes, les alertes qu'on surveille chez lui, et les données brutes.
    // Une coquille, cinq vues routées — l'en-tête et l'épingle appartiennent à
    // la coquille.
    path: 'comptes-clients/:id',
    canActivate: [permissionGuard('companies:read')],
    title: 'Compte client — LFC B2B admin',
    loadComponent: () => import('./fiche-client-shell').then((m) => m.FicheClientShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./dashboard/dashboard-page').then((m) => m.ClientDashboardPage),
      },
      {
        path: 'informations',
        loadComponent: () =>
          import('./informations/informations-page').then((m) => m.InformationsPage),
      },
      {
        path: 'commandes',
        loadComponent: () =>
          import('./commandes/commandes-page').then((m) => m.ClientCommandesPage),
      },
      {
        path: 'facturation',
        loadComponent: () =>
          import('./facturation/facturation-page').then((m) => m.ClientFacturationPage),
      },
      {
        path: 'stats',
        loadComponent: () => import('./stats/stats-page').then((m) => m.ClientStatsPage),
      },
      {
        path: 'paniers-recurrents',
        loadComponent: () =>
          import('./paniers-recurrents/paniers-recurrents-page').then(
            (m) => m.ClientPaniersRecurrentsPage,
          ),
      },
      {
        path: 'alertes',
        loadComponent: () => import('./alertes/alertes-page').then((m) => m.ClientAlertesPage),
      },
      {
        path: 'data',
        loadComponent: () => import('./data/data-page').then((m) => m.ClientDataPage),
      },
    ],
  },
];
