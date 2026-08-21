import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/** Les routes de la section **Admin** — annuaire staff, accès, journal. */
export const adminRoutes: Routes = [
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
    loadComponent: () => import('./admin-page/admin-page').then((m) => m.AdminPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'acces-en-attente' },
      {
        path: 'acces-en-attente',
        canActivate: [permissionGuard('companies:read')],
        title: 'Accès à remettre — LFC B2B admin',
        loadComponent: () =>
          import('./acces-en-attente/acces-en-attente-page').then((m) => m.AccesEnAttentePage),
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
          import('./staff-users/reglages-staff-users-page').then((m) => m.ReglagesStaffUsersPage),
      },
      {
        path: 'journal',
        // `activity:read` : le journal traverse les modules, il a sa ressource.
        // Hériter du garde du parent l'ouvrirait à quiconque lit les sociétés.
        canActivate: [permissionGuard('activity:read')],
        title: 'Journal d’activité — LFC B2B admin',
        loadComponent: () => import('./journal/journal-page').then((m) => m.JournalPage),
      },
    ],
  },
];
