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
    path: 'produits',
    title: 'Produits — Chevallot PIM',
    loadComponent: () =>
      import('./catalogue/products-page').then((m) => m.ProductsPage),
  },
];
