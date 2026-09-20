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
      { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
      {
        // LA PORTE DE L'ESPACE. Elle ouvrait sur les entités juridiques — un
        // écran de RÉGLAGE, qu'on visite trois fois dans une vie. Arriver là
        // chaque matin donnait à l'espace l'allure d'un panneau de
        // configuration.
        path: 'tableau-de-bord',
        title: 'Comptabilité — LFC B2B admin',
        loadComponent: () =>
          import('./tableau-de-bord/tableau-de-bord-page').then((m) => m.TableauDeBordPage),
      },
      {
        path: 'entites-juridiques',
        title: 'Entités juridiques — LFC B2B admin',
        loadComponent: () =>
          import('./entites-juridiques/entites-juridiques-page').then(
            (m) => m.EntitesJuridiquesPage,
          ),
      },
      {
        // La FICHE d'une entité — tout ce qui se règle sur un émetteur. Elle
        // n'a pas de garde propre pour la raison écrite en tête de fichier :
        // elle parle de la même ressource que la liste dont elle vient.
        path: 'entites-juridiques/:id',
        title: 'Entité juridique — LFC B2B admin',
        loadComponent: () =>
          import('./entites-juridiques/detail/legal-entity-detail-page').then(
            (m) => m.LegalEntityDetailPage,
          ),
      },
    ],
  },
];
