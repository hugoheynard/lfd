import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';
import { JOURNAL_SOURCE_KEY, type JournalSource } from '../admin/journal/journal-source';
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
    canActivate: [permissionGuard('pim_catalog:read')],
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
        canActivate: [permissionGuard('pim_tax:read')],
        title: 'Taux de TVA — LFC B2B admin',
        loadComponent: () =>
          import('./catalogue/vat-rates/vat-rates-page').then((m) => m.VatRatesPage),
      },
      {
        // « Règles comptables », retirée le 2026-10-27 : le prix pro n'a plus
        // qu'une source, la saisie sur la fiche (lot R3), et la page n'avait
        // plus rien à régler. Un favori ne tombe pas en page blanche.
        path: 'regles-comptables',
        pathMatch: 'full',
        redirectTo: '/pim/produits',
      },
      {
        // LE JOURNAL FISCAL — l'écran Journal de l'Admin, lu sur sa tranche
        // fiscale (plan journal, lot 4). Rangé ici, à côté des taux dont il
        // raconte l'histoire : c'est là que la
        // comptabilité travaille, et l'Admin ne lui est pas ouvert.
        //
        // `tax:write` et non le `tax:read` de ses deux voisins : c'est le droit
        // que la route serveur exige (Hugo, 2026-09-19 — qui écrit les taux
        // relit leur histoire). En `read`, un commercial ouvrirait un écran
        // dont chaque appel rendrait 403.
        path: 'journal-fiscal',
        canActivate: [permissionGuard('pim_tax:write')],
        title: 'Journal fiscal — LFC B2B admin',
        data: { [JOURNAL_SOURCE_KEY]: 'tax' satisfies JournalSource },
        loadComponent: () => import('../admin/journal/journal-page').then((m) => m.JournalPage),
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
        // Deux écrans POSÉS avant leur contenu : l'entrée de menu dit où la
        // chose ira, la page vide dit qu'elle n'y est pas encore. Une entrée
        // absente laisserait chercher ; une page plausible mais inerte
        // mentirait.
        path: 'allergenes',
        title: 'Allergènes — LFC B2B admin',
        loadComponent: () =>
          import('./product-settings/allergens-page/allergens-page').then((m) => m.AllergensPage),
      },
      {
        path: 'conditionnements',
        title: 'Conditionnements — LFC B2B admin',
        loadComponent: () =>
          import('./product-settings/packaging-page/packaging-page').then((m) => m.PackagingPage),
      },
      {
        // Sa PROPRE entrée, et pas une section d'un écran voisin. La règle a
        // vécu sous « Retraits & livraisons », et cette place-là affirmait —
        // sans jamais l'écrire — que l'heure limite est une affaire
        // d'acheminement. Tout le monde l'a lue ainsi pendant des mois.
        path: 'limites-de-commande',
        title: 'Limites de commande — LFC B2B admin',
        loadComponent: () =>
          import('./order-time-limits/order-time-limits-page/order-time-limits-page').then(
            (m) => m.OrderTimeLimitsPage,
          ),
      },
      // LES OPÉRATIONS DATÉES ont quitté le référentiel le 2026-10-13 (Hugo :
      // « ne devrait plus ouvrir le secondary menu du pim ») : route de premier
      // niveau `/operations`, dans Gestion Boutique. Les anciennes adresses
      // vivent dans des favoris et y redirigent.
      { path: 'operations', pathMatch: 'full', redirectTo: '/operations' },
      { path: 'operations/:key', redirectTo: '/operations/:key' },
      {
        path: 'appellations',
        title: 'Appellations — LFC B2B admin',
        loadComponent: () =>
          import('./provenance/appellations-page/appellations-page').then(
            (m) => m.AppellationsPage,
          ),
      },
      // L'écran « Publication » (le push) est parti en X2 (2026-10-17) : les
      // faits du catalogue partent d'eux-mêmes. L'adresse vit dans des
      // favoris ; elle mène aux Intégrations, où se réémet le catalogue.
      { path: 'publication', pathMatch: 'full', redirectTo: '/pim/integration' },
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
