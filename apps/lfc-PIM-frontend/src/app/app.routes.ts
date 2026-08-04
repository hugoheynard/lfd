import { type Routes } from '@angular/router';

import { pendingChangesGuard } from './catalogue/product-form/pending-changes.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'produits' },
  {
    path: 'tva',
    title: 'Régimes de TVA — LFC PIM',
    loadComponent: () =>
      import('./catalogue/tva-regimes/tva-regimes-page').then(
        (m) => m.TvaRegimesPage,
      ),
  },
  {
    path: 'collections',
    title: 'Collections — LFC PIM',
    loadComponent: () =>
      import('./catalogue/collections/collections-page').then(
        (m) => m.CollectionsPage,
      ),
  },
  {
    path: 'publication',
    title: 'Publication — LFC PIM',
    loadComponent: () =>
      import('./publication/publication-page/publication-page').then(
        (m) => m.PublicationPage,
      ),
  },
  {
    path: 'categories',
    title: 'Catégories — LFC PIM',
    loadComponent: () =>
      import('./catalogue/categories-page/categories-page').then(
        (m) => m.CategoriesPage,
      ),
  },
  {
    path: 'emplacements',
    title: 'Emplacements — LFC PIM',
    loadComponent: () =>
      import('./emplacements/emplacements-page').then(
        (m) => m.EmplacementsPage,
      ),
  },
  {
    path: 'documentation',
    title: 'Documentation — LFC PIM',
    loadComponent: () =>
      import('./documentation/documentation-page').then(
        (m) => m.DocumentationPage,
      ),
  },
  {
    path: 'integration',
    title: 'Intégrations — LFC PIM',
    loadComponent: () =>
      import('./integration/integration-page/integration-page').then(
        (m) => m.IntegrationPage,
      ),
  },
  {
    path: 'reglages',
    title: 'Réglages — LFC PIM',
    loadComponent: () =>
      import('./channels/settings-page/settings-page').then(
        (m) => m.SettingsPage,
      ),
  },
  {
    path: 'produits/nouveau',
    title: 'Nouveau produit — LFC PIM',
    canDeactivate: [pendingChangesGuard],
    loadComponent: () =>
      import('./catalogue/product-form/product-form-page').then(
        (m) => m.ProductFormPage,
      ),
  },
  {
    path: 'produits/:id',
    title: 'Éditer un produit — LFC PIM',
    canDeactivate: [pendingChangesGuard],
    loadComponent: () =>
      import('./catalogue/product-form/product-form-page').then(
        (m) => m.ProductFormPage,
      ),
  },
  {
    path: 'produits',
    title: 'Produits — LFC PIM',
    loadComponent: () =>
      import('./catalogue/products-page/products-page').then(
        (m) => m.ProductsPage,
      ),
  },
];
