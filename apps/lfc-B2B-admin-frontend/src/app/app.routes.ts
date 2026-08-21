import { type Routes } from '@angular/router';

import { permissionGuard } from './auth/permission.guard';
import { pendingChangesGuard } from './pim/catalogue/product-form/pending-changes.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'comptes-clients' },
  {
    // AVANT `comptes-clients/:id` : sans cela « nouveau » serait lu comme un
    // identifiant de société, et la page afficherait « Société introuvable ».
    path: 'comptes-clients/nouveau',
    canActivate: [permissionGuard('companies:write')],
    title: 'Nouveau compte client — LFC B2B admin',
    loadComponent: () =>
      import('./fiche-client/nouveau-compte-shell').then((m) => m.NouveauCompteShell),
  },
  {
    // Le détail d'une commande vit HORS de la fiche client : une commande « zéro
    // friction » n'a pas d'entreprise, donc pas de fiche où la loger. Une route
    // de premier niveau les couvre toutes les deux.
    path: 'commandes/:id',
    canActivate: [permissionGuard('orders:read')],
    title: 'Commande — LFC B2B admin',
    loadComponent: () =>
      import('./commandes/commande-page/commande-page').then((m) => m.AdminCommandePage),
  },
  {
    // PLEINE PAGE, hors de la coquille à onglets de la fiche : on y saisit une
    // commande pendant dix minutes, avec le client en ligne, et les trois
    // colonnes réclament toute la largeur. Des onglets à côté inviteraient à en
    // sortir en cours de saisie — et le panier ne survit pas à la navigation.
    path: 'comptes-clients/:id/nouvelle-commande',
    canActivate: [permissionGuard('orders:write')],
    title: 'Nouvelle commande — LFC B2B admin',
    loadComponent: () =>
      import('./commandes/nouvelle-commande/nouvelle-commande-page').then(
        (m) => m.NouvelleCommandePage,
      ),
  },
  {
    // La carte de santé de l'écosystème. Route de premier niveau et courte : on
    // y va quand quelque chose cloche, souvent depuis un autre onglet, et
    // parfois en la dictant. `ops:read` et pas `settings:read` — regarder la
    // flotte n'est pas la régler.
    path: 'sante',
    canActivate: [permissionGuard('ops:read')],
    title: 'Santé de l’écosystème — LFC B2B admin',
    loadComponent: () => import('./ops/sante-page/sante-page').then((m) => m.SantePage),
  },
  {
    // La cible d'un QR de retrait. Route de premier niveau et courte : elle est
    // encodée dans un code-barres, et parfois dictée au téléphone le jour où une
    // caméra refuse de lire. Chaque caractère de plus densifie les modules, donc
    // fragilise le scan — ce n'est pas de la coquetterie d'URL.
    path: 'retrait/:token',
    canActivate: [permissionGuard('orders:write')],
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
    canActivate: [permissionGuard('companies:read')],
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
        path: 'facturation',
        loadComponent: () =>
          import('./fiche-client/facturation/facturation-page').then(
            (m) => m.ClientFacturationPage,
          ),
      },
      {
        path: 'stats',
        loadComponent: () =>
          import('./fiche-client/stats/stats-page').then((m) => m.ClientStatsPage),
      },
      {
        path: 'paniers-recurrents',
        loadComponent: () =>
          import('./fiche-client/paniers-recurrents/paniers-recurrents-page').then(
            (m) => m.ClientPaniersRecurrentsPage,
          ),
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
    // ADMIN — ce qui se règle sur les GENS, par opposition aux Réglages, qui
    // portent sur le commerce (retraits, catalogue, tarification, facturation).
    // Deux vues qui vivaient chacune ailleurs, et mal : « Utilisateurs » sous
    // Réglages avec un garde d'exception, « Accès à remettre » dans le menu
    // principal pour un geste rare. Les deux répondent à la même question —
    // qui entre, et avec quoi.
    //
    // Le garde du parent est le PLUS FAIBLE des deux enfants, et chaque vue
    // porte le sien : le contraire enfermerait dehors qui n'a que l'un des deux
    // droits — même prudence que sur Commercial.
    path: 'admin',
    canActivate: [permissionGuard('companies:read')],
    title: 'Admin — LFC B2B admin',
    loadComponent: () => import('./admin/admin-page/admin-page').then((m) => m.AdminPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'acces-en-attente' },
      {
        path: 'acces-en-attente',
        canActivate: [permissionGuard('companies:read')],
        title: 'Accès à remettre — LFC B2B admin',
        loadComponent: () =>
          import('./admin/acces-en-attente/acces-en-attente-page').then(
            (m) => m.AccesEnAttentePage,
          ),
      },
      {
        path: 'utilisateurs',
        // `staff:read` et non `companies:read` : l'annuaire de l'équipe est la
        // seule ressource que le catalogue réserve à `admin`. Hériter du garde
        // du parent ouvrait l'écran à quiconque lit les sociétés, et chaque
        // appel y rendait 403.
        canActivate: [permissionGuard('staff:read')],
        title: 'Utilisateurs — LFC B2B admin',
        loadComponent: () =>
          import('./admin/staff-users/reglages-staff-users-page').then(
            (m) => m.ReglagesStaffUsersPage,
          ),
      },
      {
        path: 'journal',
        // `activity:read` : le journal traverse les modules, il a sa ressource.
        // Hériter du garde du parent l'ouvrirait à quiconque lit les sociétés.
        canActivate: [permissionGuard('activity:read')],
        title: 'Journal d’activité — LFC B2B admin',
        loadComponent: () => import('./admin/journal/journal-page').then((m) => m.JournalPage),
      },
    ],
  },
  {
    path: 'reglages',
    canActivate: [permissionGuard('settings:read')],
    title: 'Réglages — LFC B2B admin',
    loadComponent: () => import('./reglages/reglages-page').then((m) => m.ReglagesPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'retraits-livraisons' },

      {
        path: 'retraits-livraisons',
        title: 'Retraits & livraisons — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/retraits-livraisons/reglages-pickup-page').then(
            (m) => m.ReglagesPickupPage,
          ),
      },
      {
        path: 'catalogue',
        title: 'Catalogue — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/catalogue/reglages-catalogue-page').then(
            (m) => m.ReglagesCataloguePage,
          ),
      },
      {
        path: 'tarification',
        title: 'Tarification — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/tarification/reglages-tarification-page').then(
            (m) => m.ReglagesTarificationPage,
          ),
      },
      {
        // La frise vit à côté de la grille, pas dedans : deux façons de lire le
        // même prix — l'une pour décider aujourd'hui, l'autre pour comprendre ce
        // qui s'est passé. Une route propre les rend partageables par lien.
        path: 'tarification/frise',
        title: 'Frise tarifaire — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/tarification/frise/frise-page').then((m) => m.FrisePage),
      },
      {
        // Le banc d'essai vit à côté de la grille et de la frise : trois façons
        // de lire le même prix — ce qui est décidé, ce qui l'était, et ce que
        // ça donne pour ce client-là à cette quantité-là.
        path: 'tarification/simulateur',
        title: 'Simulateur de prix — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/tarification/simulateur/simulateur-page').then(
            (m) => m.SimulateurPage,
          ),
      },
      {
        path: 'facturation',
        title: 'Facturation — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/facturation/reglages-facturation-page').then(
            (m) => m.ReglagesFacturationPage,
          ),
      },
      {
        path: 'commercial',
        canActivate: [permissionGuard('growth:read')],
        title: 'Commercial — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/commercial/reglages-commercial-page').then(
            (m) => m.ReglagesCommercialPage,
          ),
      },
    ],
  },
  {
    // ANALYTICS — le module qui lit ce que le parc raconte.
    //
    // La croissance en est la première vue, sortie de Commercial : elle y était
    // rangée avec le travail du commercial (son cockpit, ses prospects, son
    // calendrier), alors qu'elle ne se consulte pas pour agir sur un dossier
    // mais pour comprendre un mouvement. Deux gestes différents, deux endroits.
    //
    // Une section à part et non une page : ce qui viendra ensuite — cohortes,
    // marges, saisonnalité — sont des VUES de la même question, et elles
    // demanderont des onglets plutôt qu'une entrée de rail chacune.
    // PLAT tant qu'il n'y a qu'une vue. Un shell à onglets pour un seul onglet
    // serait une coquille : il deviendra une section — comme Commercial —
    // quand la deuxième vue arrivera (cohortes, marges, saisonnalité), et pas
    // avant. Généraliser au SECOND usage, ici comme ailleurs.
    path: 'analytics',
    canActivate: [permissionGuard('growth:read')],
    title: 'Analytics — LFC B2B admin',
    loadComponent: () =>
      import('./analytics/croissance/croissance-page').then((m) => m.CroissancePage),
  },
  {
    // LE RÉFÉRENTIEL — module de cette application depuis la greffe.
    //
    // Il fut une app à part, embarquée en iframe dans le shell, avec sa session
    // relayée par `postMessage`, sa base d'API, son projet Pages. Ces raisons
    // sont tombées une par une — backend fondu (B2c), audience retirée (B2d),
    // base décidée fondue (B4) — et ce qui restait n'était plus une frontière
    // mais de la duplication.
    //
    // Toutes ses vues sont PARESSEUSES : l'admin est à ~998 ko pour une erreur
    // de budget à 1 300, et le référentiel pesait 594 ko. La greffe ne tient que
    // parce que rien n'entre dans le bundle initial.
    path: 'pim',
    canActivate: [permissionGuard('catalog:read')],
    title: 'Référentiel — LFC B2B admin',
    loadComponent: () => import('./pim/pim-page/pim-page').then((m) => m.PimPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'produits' },
      {
        path: 'tva',
        // Le référentiel fiscal a sa propre ressource : la comptabilité l'écrit,
        // alors qu'elle ne fait que lire le reste du catalogue. Le parent exige
        // déjà `catalog:read`, mais c'est `tax:read` qui décide de CET écran —
        // une dérogation `deny tax:read` doit le fermer sans fermer le PIM.
        canActivate: [permissionGuard('tax:read')],
        title: 'Régimes de TVA — LFC B2B admin',
        loadComponent: () =>
          import('./pim/catalogue/tva-regimes/tva-regimes-page').then((m) => m.TvaRegimesPage),
      },
      {
        path: 'collections',
        title: 'Collections — LFC B2B admin',
        loadComponent: () =>
          import('./pim/catalogue/collections/collections-page').then((m) => m.CollectionsPage),
      },
      {
        path: 'publication',
        title: 'Publication — LFC B2B admin',
        loadComponent: () =>
          import('./pim/publication/publication-page/publication-page').then(
            (m) => m.PublicationPage,
          ),
      },
      {
        path: 'categories',
        title: 'Catégories — LFC B2B admin',
        loadComponent: () =>
          import('./pim/catalogue/categories-page/categories-page').then((m) => m.CategoriesPage),
      },
      {
        path: 'emplacements',
        title: 'Emplacements — LFC B2B admin',
        loadComponent: () =>
          import('./pim/emplacements/emplacements-page').then((m) => m.EmplacementsPage),
      },
      {
        path: 'integration',
        title: 'Intégrations — LFC B2B admin',
        loadComponent: () =>
          import('./pim/integration/integration-page/integration-page').then(
            (m) => m.IntegrationPage,
          ),
      },
      {
        path: 'produits/nouveau',
        title: 'Nouveau produit — LFC B2B admin',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () =>
          import('./pim/catalogue/product-form/product-form-page').then((m) => m.ProductFormPage),
      },
      {
        path: 'produits/:id',
        title: 'Éditer un produit — LFC B2B admin',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () =>
          import('./pim/catalogue/product-form/product-form-page').then((m) => m.ProductFormPage),
      },
      {
        path: 'produits',
        title: 'Produits — LFC B2B admin',
        loadComponent: () =>
          import('./pim/catalogue/products-page/products-page').then((m) => m.ProductsPage),
      },
    ],
  },
  {
    // LA DOCUMENTATION — au pied du menu, avec les Réglages : on ne l'ouvre pas
    // pour travailler, on l'ouvre pour comprendre puis on repart. Elle était un
    // onglet du PIM, ce qui la réservait à qui a `catalog:read` et la noyait
    // parmi des écrans de travail. Sans garde : c'est de la prose sur le
    // fonctionnement du catalogue, pas une donnée.
    path: 'documentation',
    title: 'Documentation — LFC B2B admin',
    loadComponent: () =>
      import('./documentation/documentation-page').then((m) => m.DocumentationPage),
  },
  {
    // LIVRAISON — la place réservée, et rien d'autre pour l'instant. L'entrée
    // existe avant le module pour que personne ne range ses premiers écrans
    // dans « Production » en attendant, d'où plus personne ne les sortirait.
    // Même mur que la production : c'est la même commande, vue au bout.
    path: 'livraison',
    canActivate: [permissionGuard('orders:read')],
    title: 'Livraison — LFC B2B admin',
    loadComponent: () =>
      import('./livraison/livraison-page/livraison-page').then((m) => m.LivraisonPage),
  },
  {
    // L'APP MOBILE — il n'y en a pas à télécharger : c'est cette adresse-ci,
    // ajoutée à l'écran d'accueil. Sans garde, comme la documentation : la page
    // ne montre qu'un QR de sa propre origine et le mode d'emploi.
    path: 'app-mobile',
    title: 'Obtenir l’app mobile — LFC B2B admin',
    loadComponent: () =>
      import('./app-mobile/app-mobile-page/app-mobile-page').then((m) => m.AppMobilePage),
  },
  {
    path: 'production',
    // Les commandes en lecture : c'est la même donnée que la liste staff, vue
    // par le fournil. Le garde est ici parce qu'une URL tapée ou un favori ne
    // passent pas par le rail — et un poste du labo ouvrira exactement ça.
    canActivate: [permissionGuard('orders:read')],
    title: 'Production — LFC B2B admin',
    loadComponent: () => import('./production/production-page').then((m) => m.ProductionPage),
  },
  {
    path: 'commercial',
    // Le rail masquait déjà l'entrée sans le droit — mais une URL tapée, un
    // favori ou un lien collé ne passent pas par le rail. Le garde est ici
    // parce que c'est le seul endroit par lequel on entre vraiment.
    //
    // 🔴 `companies:read` et NON `growth:read` depuis que « Comptes clients »
    // est un onglet d'ici. `comptabilite` et `support` ont le premier sans le
    // second : garder `growth:read` sur le parent les enfermerait dehors, et
    // leur retirerait des fiches clients qu'ils consultent aujourd'hui. Chaque
    // vue de croissance porte donc son propre garde, et le parent ne contrôle
    // plus que l'entrée.
    //
    // ⚠️ À revoir avec la refonte des rôles : c'est la direction PRUDENTE
    // (personne ne perd d'accès), pas forcément la bonne au terme.
    canActivate: [permissionGuard('companies:read')],
    title: 'Commercial — LFC B2B admin',
    loadComponent: () => import('./commercial/commercial-page').then((m) => m.CommercialPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'cockpit' },
      {
        path: 'cockpit',
        canActivate: [permissionGuard('growth:read')],
        title: 'Tableau de bord — LFC B2B admin',
        loadComponent: () => import('./commercial/cockpit/cockpit-page').then((m) => m.CockpitPage),
      },
      {
        // La LISTE des comptes est une vue du poste de travail commercial ; la
        // FICHE, elle, reste au premier niveau (comme `commandes/:id`) — on ne
        // reste pas dans le poste de travail quand on ouvre un dossier.
        path: 'comptes-clients',
        canActivate: [permissionGuard('companies:read')],
        title: 'Comptes clients — LFC B2B admin',
        loadComponent: () =>
          import('./comptes-clients/comptes-clients-page').then((m) => m.ComptesClientsPage),
      },
      {
        path: 'prospects',
        canActivate: [permissionGuard('growth:read')],
        title: 'Prospects — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/prospects/prospects-page').then((m) => m.ProspectsPage),
      },
      // L'onglet a fusionné dans Prospects : on redirige plutôt que de rendre un
      // lien partagé caduc.
      { path: 'activation', pathMatch: 'full', redirectTo: 'prospects' },
      {
        path: 'calendrier',
        canActivate: [permissionGuard('growth:read')],
        title: 'Calendrier — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/calendrier/calendrier-page').then((m) => m.CalendrierPage),
      },
      // Deux LISTES et non deux vues du même objet : un gabarit de mercuriale se
      // pose chez un client, un gabarit de devis sert à chiffrer. Même écran,
      // parce qu'ils portent la même grille ; deux routes, parce qu'on ne les
      // consulte pas pour la même raison. La nature vient de la route, jamais
      // d'un état interne — un lien collé doit ouvrir la bonne liste.
      { path: 'tarification', pathMatch: 'full', redirectTo: 'tarification/mercuriales-templates' },
      {
        path: 'tarification/mercuriales-templates',
        title: 'Gabarits de mercuriale — LFC B2B admin',
        data: { kind: 'mercuriale' },
        loadComponent: () =>
          import('./commercial/tarification/gabarits/gabarits-page').then((m) => m.GabaritsPage),
      },
      {
        // La grille d'UN gabarit : le layout de la tarification générale, édité
        // en place. `nouveau` compose, un identifiant révise — même écran, parce
        // que composer et réviser sont le même geste sur le même objet.
        path: 'tarification/mercuriales-templates/:id',
        title: 'Grille de mercuriale — LFC B2B admin',
        data: { kind: 'mercuriale' },
        loadComponent: () =>
          import('./commercial/tarification/grille/gabarit-grille-page').then(
            (m) => m.GabaritGrillePage,
          ),
      },
      {
        path: 'tarification/devis-templates',
        title: 'Gabarits de devis — LFC B2B admin',
        data: { kind: 'devis' },
        loadComponent: () =>
          import('./commercial/tarification/gabarits/gabarits-page').then((m) => m.GabaritsPage),
      },
      {
        // La grille d'UN gabarit : le layout de la tarification générale, édité
        // en place. `nouveau` compose, un identifiant révise — même écran, parce
        // que composer et réviser sont le même geste sur le même objet.
        path: 'tarification/devis-templates/:id',
        title: 'Grille de devis — LFC B2B admin',
        data: { kind: 'devis' },
        loadComponent: () =>
          import('./commercial/tarification/grille/gabarit-grille-page').then(
            (m) => m.GabaritGrillePage,
          ),
      },
    ],
  },
  {
    // PLEINE PAGE, hors du shell à onglets de « Commercial » : on y travaille un
    // rendez-vous, pas on y navigue entre des vues. Les onglets à côté du dossier
    // inviteraient à en sortir, et voleraient la largeur au rail d'historique.
    // Le retour se fait par un lien explicite, pas par un onglet resté allumé.
    path: 'rendez-vous/:appointmentId',
    canActivate: [permissionGuard('appointments:read')],
    title: 'Rendez-vous — LFC B2B admin',
    loadComponent: () =>
      import('./commercial/calendrier/rendez-vous/rendez-vous-page').then((m) => m.RendezVousPage),
  },
];
