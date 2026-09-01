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
    canActivate: [permissionGuard('b2b_companies:read')],
    title: 'Admin — LFC B2B admin',
    loadComponent: () => import('./admin-page/admin-page').then((m) => m.AdminPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'acces-en-attente' },
      {
        path: 'acces-en-attente',
        canActivate: [permissionGuard('b2b_companies:read')],
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
        canActivate: [permissionGuard('staff_access:read')],
        title: 'Utilisateurs — LFC B2B admin',
        loadComponent: () =>
          import('./staff-users/reglages-staff-users-page').then((m) => m.ReglagesStaffUsersPage),
      },
      {
        // Les RÔLES, à côté des utilisateurs et sous le même droit : définir un
        // droit et l'attribuer sont le même pouvoir vu de deux côtés. Les
        // séparer donnerait à quelqu'un celui de fabriquer des droits sans
        // celui de les donner — ce qui n'a de sens ni pour l'un ni pour l'autre.
        path: 'roles',
        canActivate: [permissionGuard('staff_access:read')],
        title: 'Rôles — LFC B2B admin',
        loadComponent: () => import('./roles/roles-page').then((m) => m.RolesPage),
      },
      {
        // ORDRE — avant `roles/:key` : sans cela « nouveau » serait lu comme la
        // clé d'un rôle, et la page dirait « ce rôle n'est pas modifiable ».
        // Même piège que « comptes-clients/nouveau », même remède.
        path: 'roles/nouveau',
        canActivate: [permissionGuard('staff_access:write')],
        title: 'Nouveau rôle — LFC B2B admin',
        loadComponent: () =>
          import('./roles/role-editor/role-editor-page').then((m) => m.RoleEditorPage),
      },
      {
        // Une PAGE et non un panneau : un rôle ne restera pas « un libellé et
        // douze niveaux » (portées, conditions, qui peut l'attribuer), et
        // chacune de ces additions étoufferait un panneau latéral.
        path: 'roles/:key',
        canActivate: [permissionGuard('staff_access:write')],
        title: 'Modifier un rôle — LFC B2B admin',
        loadComponent: () =>
          import('./roles/role-editor/role-editor-page').then((m) => m.RoleEditorPage),
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
