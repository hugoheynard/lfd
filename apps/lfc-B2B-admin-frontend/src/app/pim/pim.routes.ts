import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';
import { pendingChangesGuard } from './catalogue/product-form/pending-changes.guard';

/** Les routes du **référentiel** (PIM) — produits, familles, taux, canaux. */
export const pimRoutes: Routes = [
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
    loadComponent: () => import('./pim-page/pim-page').then((m) => m.PimPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'produits' },
      {
        path: 'tva',
        // Le référentiel fiscal a sa propre ressource : la comptabilité l'écrit,
        // alors qu'elle ne fait que lire le reste du catalogue. Le parent exige
        // déjà `catalog:read`, mais c'est `tax:read` qui décide de CET écran —
        // une dérogation `deny tax:read` doit le fermer sans fermer le PIM.
        canActivate: [permissionGuard('tax:read')],
        title: 'Taux de TVA — LFC B2B admin',
        loadComponent: () =>
          import('./catalogue/vat-rates/vat-rates-page').then((m) => m.VatRatesPage),
      },
      {
        // Le registre décide de ce qu'on peut VENDRE, mais il ne porte aucun
        // taux : `catalog:read` suffit, `tax:read` serait un mur pour rien.
        path: 'contextes',
        title: 'Contextes de vente — LFC B2B admin',
        loadComponent: () =>
          import('./sales-contexts/sales-contexts-page/sales-contexts-page').then(
            (m) => m.SalesContextsPage,
          ),
      },
      {
        path: 'collections',
        title: 'Collections — LFC B2B admin',
        loadComponent: () =>
          import('./integration/shopify-collections/collections-page/collections-page').then(
            (m) => m.CollectionsPage,
          ),
      },
      {
        path: 'publication',
        title: 'Publication — LFC B2B admin',
        loadComponent: () =>
          import('./publication/publication-page/publication-page').then((m) => m.PublicationPage),
      },
      {
        path: 'categories',
        title: 'Catégories — LFC B2B admin',
        loadComponent: () =>
          import('./catalogue/categories-page/categories-page').then((m) => m.CategoriesPage),
      },
      {
        path: 'emplacements',
        title: 'Points de vente — LFC B2B admin',
        loadComponent: () =>
          import('./points-of-sale/points-of-sale-page').then((m) => m.PointsOfSalePage),
      },
      {
        path: 'integration',
        title: 'Intégrations — LFC B2B admin',
        loadComponent: () =>
          import('./integration/integration-page/integration-page').then((m) => m.IntegrationPage),
      },
      {
        path: 'produits/nouveau',
        title: 'Nouveau produit — LFC B2B admin',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () =>
          import('./catalogue/product-form/product-form-page').then((m) => m.ProductFormPage),
      },
      {
        path: 'produits/:id',
        title: 'Éditer un produit — LFC B2B admin',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () =>
          import('./catalogue/product-form/product-form-page').then((m) => m.ProductFormPage),
      },
      {
        path: 'produits',
        title: 'Produits — LFC B2B admin',
        loadComponent: () =>
          import('./catalogue/products-page/products-page').then((m) => m.ProductsPage),
      },
    ],
  },
];
