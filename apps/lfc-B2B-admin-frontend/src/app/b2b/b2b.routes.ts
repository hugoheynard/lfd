import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/**
 * Les routes de l'**espace B2B** — le catalogue vendu et sa tarification.
 *
 * Elles vivaient sous `/reglages`. Les anciennes URL restent servies par des
 * redirections (`app.routes.ts`) : elles sont dans les favoris, dans des liens
 * collés, et une adresse qui tombe en 404 après un rangement est un rangement
 * qui coûte à celui qui ne l'a pas fait.
 */
export const b2bRoutes: Routes = [
  {
    path: 'b2b',
    canActivate: [permissionGuard('settings:read')],
    title: 'B2B — LFC B2B admin',
    loadComponent: () => import('./b2b-page/b2b-page').then((m) => m.B2bPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'catalogue' },
      {
        // LE CONTENU DE PLATEFORME — les textes de la vitrine. Sous le B2B et
        // non dans un espace à lui : c'est le même contexte que son catalogue
        // et sa tarification, et un espace séparé aurait fait deux portes pour
        // une seule maison.
        path: 'contenu',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'app-layout' },
          {
            path: 'app-layout',
            title: 'App layout — LFC B2B admin',
            loadComponent: () =>
              import('../contenu/app-layout/app-layout-page').then((m) => m.AppLayoutPage),
          },
        ],
      },
      {
        path: 'catalogue',
        title: 'Catalogue B2B — LFC B2B admin',
        loadComponent: () => import('./catalogue/catalogue-page').then((m) => m.CataloguePage),
      },
      {
        path: 'tarification',
        title: 'Tarification B2B — LFC B2B admin',
        loadComponent: () =>
          import('./tarification/tarification-page').then((m) => m.TarificationPage),
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
    ],
  },
];
