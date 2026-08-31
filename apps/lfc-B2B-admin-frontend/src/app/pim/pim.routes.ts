import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';
import { publicationEnabledGuard } from './capabilities/publication.guard';
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
      // L'ACCUEIL du référentiel : « où en est le catalogue » est la première
      // question qu'on se pose en l'ouvrant, et la réponse était éclatée sur
      // trois écrans. La liste des produits était l'accueil par défaut faute de
      // mieux — elle répond à « lequel », pas à « où on en est ».
      { path: '', pathMatch: 'full', redirectTo: 'catalogue' },
      {
        path: 'catalogue',
        title: 'Catalogue — LFC B2B admin',
        loadComponent: () =>
          import('./catalogue-overview/overview-page/overview-page').then(
            (m) => m.CatalogueOverviewPage,
          ),
      },
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
        // Même mur que les taux, et pour la même raison : décider ce que le
        // professionnel paie par rapport au particulier est une décision
        // comptable, pas une édition de catalogue. Écran à part du référentiel
        // fiscal — un taux est imposé de l'extérieur, une remise est décidée
        // par la maison.
        path: 'regles-comptables',
        canActivate: [permissionGuard('tax:read')],
        title: 'Règles comptables — LFC B2B admin',
        loadComponent: () =>
          import('./accounting-rules/accounting-rules-page/accounting-rules-page').then(
            (m) => m.AccountingRulesPage,
          ),
      },
      {
        // Les ANCRES de publication : ce que le catalogue était, photographié et
        // nommé. Même mur que le reste du référentiel — poser une ancre ne
        // publie rien et ne modifie rien, c'est une lecture qu'on enregistre.
        path: 'revisions',
        title: 'Révisions du catalogue — LFC B2B admin',
        loadComponent: () =>
          import('./revisions/revisions-page/revisions-page').then((m) => m.RevisionsPage),
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
        // Les deux référentiels de PROVENANCE. Même mur que le reste du
        // référentiel : déclarer d'où vient un ingrédient ne touche à aucun
        // prix, donc `catalog:read` suffit — `tax:read` serait un mur pour rien.
        path: 'ingredients',
        title: 'Ingrédients — LFC B2B admin',
        loadComponent: () =>
          import('./provenance/ingredients-page/ingredients-page').then((m) => m.IngredientsPage),
      },
      {
        path: 'appellations',
        title: 'Appellations — LFC B2B admin',
        loadComponent: () =>
          import('./provenance/appellations-page/appellations-page').then(
            (m) => m.AppellationsPage,
          ),
      },
      {
        path: 'collections',
        // Fermé quand le déploiement ne publie pas — ce n'est pas un droit,
        // c'est une capacité de l'installation (cf. `publication.guard.ts`).
        canActivate: [publicationEnabledGuard],
        title: 'Collections — LFC B2B admin',
        loadComponent: () =>
          import('./integration/shopify-collections/collections-page/collections-page').then(
            (m) => m.CollectionsPage,
          ),
      },
      {
        path: 'publication',
        // Fermé quand le déploiement ne publie pas — ce n'est pas un droit,
        // c'est une capacité de l'installation (cf. `publication.guard.ts`).
        canActivate: [publicationEnabledGuard],
        title: 'Publication — LFC B2B admin',
        loadComponent: () =>
          import('./publication/publication-page/publication-page').then((m) => m.PublicationPage),
      },
      // `nouveau` AVANT `:id`, sinon le paramètre l'avale et la création
      // ouvrirait une famille dont l'identifiant serait « nouveau ».
      {
        path: 'categories/nouveau',
        title: 'Nouvelle catégorie — LFC B2B admin',
        loadComponent: () =>
          import('./catalogue/category-form/category-form-page').then((m) => m.CategoryFormPage),
      },
      {
        path: 'categories/:id',
        title: 'Éditer une catégorie — LFC B2B admin',
        loadComponent: () =>
          import('./catalogue/category-form/category-form-page').then((m) => m.CategoryFormPage),
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
        // Fermé quand le déploiement ne publie pas — ce n'est pas un droit,
        // c'est une capacité de l'installation (cf. `publication.guard.ts`).
        canActivate: [publicationEnabledGuard],
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
