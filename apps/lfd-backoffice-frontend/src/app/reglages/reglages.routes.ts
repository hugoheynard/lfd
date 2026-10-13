import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/**
 * Les **Réglages** : Réglages › Sites (lot S1 du plan des sites, 2026-10-13),
 * et les anciennes adresses des écrans partis le 2026-10-10.
 */
export const reglagesRoutes: Routes = [
  {
    path: 'reglages',
    // La coquille de l'Exploitation — renommée « Réglages » à l'écran le
    // 2026-10-10 : elle publie son rail et ne dessine rien. Pas de garde ici :
    // chaque écran porte le sien, et les redirections mènent à des
    // destinations qui portent le leur.
    loadComponent: () =>
      import('../production/production-workspace/production-workspace-page').then(
        (m) => m.ProductionWorkspacePage,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: '/documentation/facturation' },

      // Le catalogue et la tarification B2B ont DÉMÉNAGÉ dans l'espace B2B : on
      // ne va pas dans les réglages pour travailler. Les anciennes adresses
      // redirigent — elles vivent dans des favoris et des liens collés, et un
      // rangement qui rend 404 se paie par celui qui ne l'a pas fait.
      //
      // Les redirections sont ici, DANS les enfants de `reglages`, et non au
      // niveau racine : le routeur entre d'abord dans cette route parente, et
      // ce qu'il y cherche doit s'y trouver.
      { path: 'catalogue', redirectTo: '/b2b/catalogue' },
      { path: 'tarification', pathMatch: 'full', redirectTo: '/b2b/tarification' },
      { path: 'tarification/frise', redirectTo: '/b2b/tarification/frise' },
      { path: 'tarification/simulateur', redirectTo: '/b2b/tarification/simulateur' },
      // « Retraits & livraisons » a suivi, découpé en trois pages de
      // « E-commerce LFC → Réglages ». L'ancienne adresse mène à la première.
      // Elle menait aux points de retrait, devenus les sites (S1, 2026-10-13).
      { path: 'retraits-livraisons', redirectTo: '/reglages/sites' },

      // La surtaxe de retard est partie en Comptabilité, sous son propre droit
      // `b2b_late_fee` (Hugo, 2026-09-29). Absolue, sans quoi elle resterait
      // sous le mur `b2b_settings` de ce parent.
      { path: 'surtaxe-de-retard', redirectTo: '/comptabilite/surtaxe-de-retard' },

      // Partis le 2026-10-10 (Hugo) : la facturation explique, elle va à la
      // Documentation ; les réglages commerciaux vont à l'Exploitation.
      { path: 'facturation', redirectTo: '/documentation/facturation' },
      { path: 'commercial', redirectTo: '/exploitation/commercial' },

      // RÉGLAGES › SITES — nos lieux, leurs rôles, leurs couleurs. Sous SON
      // droit, `lfc_site_settings` (Hugo, Q-S5, 2026-10-13), comme l'API
      // `admin/sites` qu'il appelle.
      {
        path: 'sites',
        canActivate: [permissionGuard('lfc_site_settings:read')],
        title: 'Sites — LFC B2B admin',
        loadComponent: () => import('./sites/sites-page/sites-page').then((m) => m.SitesPage),
      },
      {
        // AVANT `:id` : sans cela `nouveau` se lirait comme un identifiant.
        path: 'sites/nouveau',
        canActivate: [permissionGuard('lfc_site_settings:write')],
        title: 'Nouveau site — LFC B2B admin',
        loadComponent: () => import('./sites/site-page/site-page').then((m) => m.SitePage),
      },
      {
        // Une page et non un panneau : identité, rôles, couleurs, heures,
        // créneaux, réduction, archivage — on va droit à l'un d'eux.
        path: 'sites/:id',
        canActivate: [permissionGuard('lfc_site_settings:read')],
        title: 'Site — LFC B2B admin',
        loadComponent: () => import('./sites/site-page/site-page').then((m) => m.SitePage),
      },
    ],
  },
];
