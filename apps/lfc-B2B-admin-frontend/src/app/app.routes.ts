import { type Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'comptes-clients' },
  {
    path: 'comptes-clients',
    title: 'Comptes clients — LFC B2B admin',
    loadComponent: () =>
      import('./comptes-clients/comptes-clients-page').then((m) => m.ComptesClientsPage),
  },
  {
    path: 'comptes-clients/:id',
    title: 'Fiche client — LFC B2B admin',
    loadComponent: () => import('./fiche-client/fiche-client-page').then((m) => m.FicheClientPage),
  },
  {
    path: 'reglages',
    title: 'Réglages — LFC B2B admin',
    loadComponent: () => import('./reglages/reglages-page').then((m) => m.ReglagesPage),
  },
  {
    path: 'commercial',
    title: 'Commercial — LFC B2B admin',
    loadComponent: () => import('./commercial/commercial-page').then((m) => m.CommercialPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'acquisition' },
      {
        path: 'acquisition',
        title: 'Acquisition — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/acquisition/acquisition-page').then((m) => m.AcquisitionPage),
      },
    ],
  },
];
