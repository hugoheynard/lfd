import { type Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'produits' },
  {
    path: 'categories',
    title: 'Catégories — LFC PIM',
    loadComponent: () =>
      import('./catalogue/categories-page/categories-page').then(
        (m) => m.CategoriesPage,
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
    path: 'produits',
    title: 'Produits — LFC PIM',
    loadComponent: () =>
      import('./catalogue/products-page/products-page').then(
        (m) => m.ProductsPage,
      ),
  },
];
