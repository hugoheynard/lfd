import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/**
 * Les routes de l'**espace Comptabilité**.
 *
 * Un seul droit à l'entrée (`b2b_accounting:read`), et une garde par vue là
 * seulement où la vue relève d'un autre mur — les limites de prix
 * (`lfc_price_limits:read`, 2026-09-25). Le reste n'en porte pas :
 * contrairement à l'Admin, dont les écrans relèvent de deux murs différents,
 * tout ce qui vit ici relève du même — l'identité d'émetteur, ses coordonnées,
 * et bientôt ses factures. Le jour où une vue demandera autre chose, elle
 * portera son `canActivate` comme l'Admin le fait déjà.
 */
export const comptabiliteRoutes: Routes = [
  {
    path: 'comptabilite',
    canActivate: [permissionGuard('b2b_accounting:read')],
    title: 'Comptabilité — LFC B2B admin',
    loadComponent: () =>
      import('./comptabilite-page/comptabilite-page').then((m) => m.ComptabilitePage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
      {
        // LA PORTE DE L'ESPACE. Elle ouvrait sur les entités juridiques — un
        // écran de RÉGLAGE, qu'on visite trois fois dans une vie. Arriver là
        // chaque matin donnait à l'espace l'allure d'un panneau de
        // configuration.
        path: 'tableau-de-bord',
        title: 'Comptabilité — LFC B2B admin',
        loadComponent: () =>
          import('./tableau-de-bord/tableau-de-bord-page').then((m) => m.TableauDeBordPage),
      },
      {
        path: 'entites-juridiques',
        title: 'Entités juridiques — LFC B2B admin',
        loadComponent: () =>
          import('./entites-juridiques/entites-juridiques-page').then(
            (m) => m.EntitesJuridiquesPage,
          ),
      },
      {
        // Les clients au crédit mensuel, et leur prélèvement bloqué ou non.
        // L'ÉCRITURE demande `b2b_accounting:write` : l'écran masque ses
        // gestes sans ce droit, et le serveur refuse de toute façon.
        path: 'blocages-prelevement',
        title: 'Blocages du prélèvement — LFC B2B admin',
        loadComponent: () =>
          import('./blocages-prelevement/blocages-prelevement-page').then(
            (m) => m.BlocagesPrelevementPage,
          ),
      },
      {
        // Faire régler par carte : commandes impayées et liens libres. Les
        // gestes (renvoyer, créer, annuler, plafond) demandent
        // `b2b_accounting:write` ; l'écran les masque sans ce droit.
        path: 'liens-de-paiement',
        title: 'Liens de paiement — LFC B2B admin',
        loadComponent: () =>
          import('./liens-de-paiement/liens-de-paiement-page').then((m) => m.LiensDePaiementPage),
      },
      {
        // Les limites de prix, pro et publiques. Elles relèvent de
        // `lfc_price_limits`, PAS de `b2b_accounting` : la vue porte donc son
        // propre garde, comme l'annonce l'en-tête de ce fichier. Les gestes
        // demandent `lfc_price_limits:write` ; l'écran les masque sans lui.
        // Plan : documentation/comptabilite/plan-limites-de-prix.md §6.
        path: 'limites-de-prix',
        canActivate: [permissionGuard('lfc_price_limits:read')],
        title: 'Limites de prix — LFC B2B admin',
        loadComponent: () =>
          import('./limites-de-prix/limites-de-prix-page').then((m) => m.LimitesDePrixPage),
      },
      {
        // La FICHE d'une entité — tout ce qui se règle sur un émetteur. Elle
        // n'a pas de garde propre pour la raison écrite en tête de fichier :
        // elle parle de la même ressource que la liste dont elle vient.
        path: 'entites-juridiques/:id',
        title: 'Entité juridique — LFC B2B admin',
        loadComponent: () =>
          import('./entites-juridiques/detail/legal-entity-detail-page').then(
            (m) => m.LegalEntityDetailPage,
          ),
      },
    ],
  },
];
