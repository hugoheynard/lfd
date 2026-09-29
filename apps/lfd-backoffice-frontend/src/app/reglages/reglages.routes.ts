import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/** Les routes des **Réglages** — paramétrage de la plateforme. */
export const reglagesRoutes: Routes = [
  {
    path: 'reglages',
    canActivate: [permissionGuard('b2b_settings:read')],
    title: 'Réglages — LFC B2B admin',
    loadComponent: () => import('./reglages-page').then((m) => m.ReglagesPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'facturation' },

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
      { path: 'retraits-livraisons', redirectTo: '/b2b/reglages/points-de-retrait' },

      // La surtaxe de retard est partie en Comptabilité, sous son propre droit
      // `b2b_late_fee` (Hugo, 2026-09-29). Absolue, sans quoi elle resterait
      // sous le mur `b2b_settings` de ce parent.
      { path: 'surtaxe-de-retard', redirectTo: '/comptabilite/surtaxe-de-retard' },

      {
        path: 'facturation',
        title: 'Facturation — LFC B2B admin',
        loadComponent: () =>
          import('./facturation/reglages-facturation-page').then((m) => m.ReglagesFacturationPage),
      },
      {
        path: 'commercial',
        canActivate: [permissionGuard('b2b_growth:read')],
        title: 'Commercial — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/reglages-commercial-page').then((m) => m.ReglagesCommercialPage),
      },
    ],
  },
];
