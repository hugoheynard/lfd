import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'produits' },
  {
    path: 'familles',
    title: 'Familles — Chevallot PIM',
    loadComponent: () =>
      import('./catalogue/categories-page').then((m) => m.CategoriesPage),
  },
  {
    path: 'reglages',
    title: 'Réglages — Chevallot PIM',
    loadComponent: () =>
      import('./channels/settings-page').then((m) => m.SettingsPage),
  },
  {
    path: 'produits',
    title: 'Produits — Chevallot PIM',
    loadComponent: () =>
      import('./catalogue/products-page').then((m) => m.ProductsPage),
  },
];
