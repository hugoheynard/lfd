import { type Routes } from '@angular/router';

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
    path: 'categories',
    title: 'Catégories — LFC PIM',
    loadComponent: () =>
      import('./catalogue/categories-page/categories-page').then(
        (m) => m.CategoriesPage,
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
    loadComponent: () =>
      import('./catalogue/create-product/create-product-page').then(
        (m) => m.CreateProductPage,
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
