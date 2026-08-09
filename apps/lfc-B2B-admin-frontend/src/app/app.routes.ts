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
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'activation' },
      {
        path: 'activation',
        title: 'Activation client — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/activation/reglages-activation-page').then(
            (m) => m.ReglagesActivationPage,
          ),
      },
      {
        path: 'retraits-livraisons',
        title: 'Retraits & livraisons — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/retraits-livraisons/reglages-pickup-page').then(
            (m) => m.ReglagesPickupPage,
          ),
      },
      {
        path: 'commercial',
        title: 'Commercial — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/commercial/reglages-commercial-page').then(
            (m) => m.ReglagesCommercialPage,
          ),
      },
      {
        path: 'utilisateurs',
        title: 'Utilisateurs — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/staff-users/reglages-staff-users-page').then(
            (m) => m.ReglagesStaffUsersPage,
          ),
      },
    ],
  },
  {
    path: 'commercial',
    title: 'Commercial — LFC B2B admin',
    loadComponent: () => import('./commercial/commercial-page').then((m) => m.CommercialPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'cockpit' },
      {
        path: 'cockpit',
        title: 'Tableau de bord — LFC B2B admin',
        loadComponent: () => import('./commercial/cockpit/cockpit-page').then((m) => m.CockpitPage),
      },
      {
        path: 'prospects',
        title: 'Prospects — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/prospects/prospects-page').then((m) => m.ProspectsPage),
      },
      // L'onglet a fusionné dans Prospects : on redirige plutôt que de rendre un
      // lien partagé caduc.
      { path: 'activation', pathMatch: 'full', redirectTo: 'prospects' },
      {
        path: 'croissance',
        title: 'Croissance — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/croissance/croissance-page').then((m) => m.CroissancePage),
      },
      {
        path: 'calendrier',
        title: 'Calendrier — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/calendrier/calendrier-page').then((m) => m.CalendrierPage),
      },
    ],
  },
  {
    // PLEINE PAGE, hors du shell à onglets de « Commercial » : on y travaille un
    // rendez-vous, pas on y navigue entre des vues. Les onglets à côté du dossier
    // inviteraient à en sortir, et voleraient la largeur au rail d'historique.
    // Le retour se fait par un lien explicite, pas par un onglet resté allumé.
    path: 'rendez-vous/:appointmentId',
    title: 'Rendez-vous — LFC B2B admin',
    loadComponent: () =>
      import('./commercial/calendrier/rendez-vous/rendez-vous-page').then((m) => m.RendezVousPage),
  },
];
