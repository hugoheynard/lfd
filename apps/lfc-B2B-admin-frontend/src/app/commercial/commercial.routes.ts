import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/**
 * Les routes du **poste de travail commercial**, et la page de rendez-vous.
 *
 * Celle-ci vit hors de la section, en plein écran : elle n'a pas d'onglet qui
 * la désignerait, et le rail l'écraserait. Elle reste ici parce que c'est le
 * commercial qui la possède.
 */
export const commercialRoutes: Routes = [
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
    canActivate: [permissionGuard('b2b_companies:read')],
    title: 'Commercial — LFC B2B admin',
    loadComponent: () => import('./commercial-page').then((m) => m.CommercialPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'cockpit' },
      {
        path: 'cockpit',
        canActivate: [permissionGuard('b2b_growth:read')],
        title: 'Tableau de bord — LFC B2B admin',
        loadComponent: () => import('./cockpit/cockpit-page').then((m) => m.CockpitPage),
      },
      {
        // La LISTE des comptes est une vue du poste de travail commercial ; la
        // FICHE, elle, reste au premier niveau (comme `commandes/:id`) — on ne
        // reste pas dans le poste de travail quand on ouvre un dossier.
        path: 'comptes-clients',
        canActivate: [permissionGuard('b2b_companies:read')],
        title: 'Comptes clients — LFC B2B admin',
        loadComponent: () =>
          import('../comptes-clients/comptes-clients-page').then((m) => m.ComptesClientsPage),
      },
      {
        path: 'prospects',
        canActivate: [permissionGuard('b2b_growth:read')],
        title: 'Prospects — LFC B2B admin',
        loadComponent: () => import('./prospects/prospects-page').then((m) => m.ProspectsPage),
      },
      // L'onglet a fusionné dans Prospects : on redirige plutôt que de rendre un
      // lien partagé caduc.
      { path: 'activation', pathMatch: 'full', redirectTo: 'prospects' },
      {
        path: 'calendrier',
        canActivate: [permissionGuard('b2b_growth:read')],
        title: 'Calendrier — LFC B2B admin',
        loadComponent: () => import('./calendrier/calendrier-page').then((m) => m.CalendrierPage),
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
          import('./tarification/gabarits/gabarits-page').then((m) => m.GabaritsPage),
      },
      {
        // La grille d'UN gabarit : le layout de la tarification générale, édité
        // en place. `nouveau` compose, un identifiant révise — même écran, parce
        // que composer et réviser sont le même geste sur le même objet.
        path: 'tarification/mercuriales-templates/:id',
        title: 'Grille de mercuriale — LFC B2B admin',
        data: { kind: 'mercuriale' },
        loadComponent: () =>
          import('./tarification/grille/gabarit-grille-page').then((m) => m.TemplateGridPage),
      },
      {
        path: 'tarification/devis-templates',
        title: 'Gabarits de devis — LFC B2B admin',
        data: { kind: 'devis' },
        loadComponent: () =>
          import('./tarification/gabarits/gabarits-page').then((m) => m.GabaritsPage),
      },
      {
        // La grille d'UN gabarit : le layout de la tarification générale, édité
        // en place. `nouveau` compose, un identifiant révise — même écran, parce
        // que composer et réviser sont le même geste sur le même objet.
        path: 'tarification/devis-templates/:id',
        title: 'Grille de devis — LFC B2B admin',
        data: { kind: 'devis' },
        loadComponent: () =>
          import('./tarification/grille/gabarit-grille-page').then((m) => m.TemplateGridPage),
      },
    ],
  },
  {
    // PLEINE PAGE, hors du shell à onglets de « Commercial » : on y travaille un
    // rendez-vous, pas on y navigue entre des vues. Les onglets à côté du dossier
    // inviteraient à en sortir, et voleraient la largeur au rail d'historique.
    // Le retour se fait par un lien explicite, pas par un onglet resté allumé.
    path: 'rendez-vous/:appointmentId',
    canActivate: [permissionGuard('b2b_appointments:read')],
    title: 'Rendez-vous — LFC B2B admin',
    loadComponent: () =>
      import('./calendrier/rendez-vous/rendez-vous-page').then((m) => m.RendezVousPage),
  },
];
