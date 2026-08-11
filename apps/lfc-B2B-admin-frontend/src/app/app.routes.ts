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
    // AVANT `comptes-clients/:id` : sans cela « nouveau » serait lu comme un
    // identifiant de société, et la page afficherait « Société introuvable ».
    path: 'comptes-clients/nouveau',
    title: 'Nouveau compte client — LFC B2B admin',
    loadComponent: () =>
      import('./comptes-clients/nouveau-compte/nouveau-compte-page').then(
        (m) => m.NouveauComptePage,
      ),
  },
  {
    // Le détail d'une commande vit HORS de la fiche client : une commande « zéro
    // friction » n'a pas d'entreprise, donc pas de fiche où la loger. Une route
    // de premier niveau les couvre toutes les deux.
    path: 'commandes/:id',
    title: 'Commande — LFC B2B admin',
    loadComponent: () =>
      import('./commandes/commande-page/commande-page').then((m) => m.AdminCommandePage),
  },
  {
    // La cible d'un QR de retrait. Route de premier niveau et courte : elle est
    // encodée dans un code-barres, et parfois dictée au téléphone le jour où une
    // caméra refuse de lire. Chaque caractère de plus densifie les modules, donc
    // fragilise le scan — ce n'est pas de la coquetterie d'URL.
    path: 'retrait/:token',
    title: 'Retrait — LFC B2B admin',
    loadComponent: () => import('./retrait/retrait-page/retrait-page').then((m) => m.RetraitPage),
  },
  {
    // Un compte se regarde de cinq façons qui n'ont pas les mêmes lecteurs : le
    // tableau de bord (avant d'appeler), les informations (pour corriger), les
    // commandes, les alertes qu'on surveille chez lui, et les données brutes.
    // Une coquille, cinq vues routées — l'en-tête et l'épingle appartiennent à
    // la coquille.
    path: 'comptes-clients/:id',
    title: 'Compte client — LFC B2B admin',
    loadComponent: () =>
      import('./fiche-client/fiche-client-shell').then((m) => m.FicheClientShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./fiche-client/dashboard/dashboard-page').then((m) => m.ClientDashboardPage),
      },
      {
        path: 'informations',
        loadComponent: () =>
          import('./fiche-client/informations/informations-page').then((m) => m.InformationsPage),
      },
      {
        path: 'commandes',
        loadComponent: () =>
          import('./fiche-client/commandes/commandes-page').then((m) => m.ClientCommandesPage),
      },
      {
        path: 'alertes',
        loadComponent: () =>
          import('./fiche-client/alertes/alertes-page').then((m) => m.ClientAlertesPage),
      },
      {
        path: 'data',
        loadComponent: () => import('./fiche-client/data/data-page').then((m) => m.ClientDataPage),
      },
    ],
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
