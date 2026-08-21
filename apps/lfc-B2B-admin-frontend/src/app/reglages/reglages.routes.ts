import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/** Les routes des **Réglages** — paramétrage de la plateforme. */
export const reglagesRoutes: Routes = [
  {
    path: 'reglages',
    canActivate: [permissionGuard('settings:read')],
    title: 'Réglages — LFC B2B admin',
    loadComponent: () => import('./reglages-page').then((m) => m.ReglagesPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'retraits-livraisons' },

      {
        path: 'retraits-livraisons',
        title: 'Retraits & livraisons — LFC B2B admin',
        loadComponent: () =>
          import('./retraits-livraisons/reglages-pickup-page').then((m) => m.ReglagesPickupPage),
      },
      {
        path: 'catalogue',
        title: 'Catalogue — LFC B2B admin',
        loadComponent: () =>
          import('./catalogue/reglages-catalogue-page').then((m) => m.ReglagesCataloguePage),
      },
      {
        path: 'tarification',
        title: 'Tarification — LFC B2B admin',
        loadComponent: () =>
          import('./tarification/reglages-tarification-page').then(
            (m) => m.ReglagesTarificationPage,
          ),
      },
      {
        // La frise vit à côté de la grille, pas dedans : deux façons de lire le
        // même prix — l'une pour décider aujourd'hui, l'autre pour comprendre ce
        // qui s'est passé. Une route propre les rend partageables par lien.
        path: 'tarification/frise',
        title: 'Frise tarifaire — LFC B2B admin',
        loadComponent: () => import('./tarification/frise/frise-page').then((m) => m.FrisePage),
      },
      {
        // Le banc d'essai vit à côté de la grille et de la frise : trois façons
        // de lire le même prix — ce qui est décidé, ce qui l'était, et ce que
        // ça donne pour ce client-là à cette quantité-là.
        path: 'tarification/simulateur',
        title: 'Simulateur de prix — LFC B2B admin',
        loadComponent: () =>
          import('./tarification/simulateur/simulateur-page').then((m) => m.SimulateurPage),
      },
      {
        path: 'facturation',
        title: 'Facturation — LFC B2B admin',
        loadComponent: () =>
          import('./facturation/reglages-facturation-page').then((m) => m.ReglagesFacturationPage),
      },
      {
        path: 'commercial',
        canActivate: [permissionGuard('growth:read')],
        title: 'Commercial — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/reglages-commercial-page').then((m) => m.ReglagesCommercialPage),
      },
    ],
  },
];
