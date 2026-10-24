import { type Routes } from '@angular/router';

import { permissionGuard } from '../auth/permission.guard';

/**
 * Les routes de l'**espace Comptabilité**.
 *
 * Un seul droit à l'entrée (`b2b_accounting:read`), et une garde par vue là
 * seulement où la vue relève d'un autre mur — les limites de prix
 * (`lfc_price_limits:read`, 2026-09-25) et la surtaxe de retard
 * (`b2b_late_fee:read`, 2026-09-29). Le reste n'en porte pas :
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
        // LES PROCÉDURES DE PRÉLÈVEMENT — une ligne par clôture : ouvertes, à
        // venir, closes récentes. `?entite=&lot=` (les anciennes adresses)
        // redirige vers le détail du lot.
        // Plan : documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md (§ 11).
        path: 'procedure-de-prelevement',
        title: 'Procédure de prélèvement — LFC B2B admin',
        loadComponent: () =>
          import('./procedure-de-prelevement/procedure-list-page/procedure-list-page').then(
            (m) => m.ProcedureListPage,
          ),
      },
      {
        // LA PROCÉDURE EN COURS D'UNE ENTITÉ — un renvoi, sans écran : la
        // fiche de l'entité ne connaît pas l'identifiant de sa procédure.
        // `?onglet=` suit le renvoi (2026-10-24). Chargé à la demande : la
        // garde importée en tête alourdissait le paquet initial de ~490 ko.
        path: 'procedure-de-prelevement/entite/:entityId',
        loadChildren: () =>
          import('./procedure-de-prelevement/procedure-entity-redirect').then(
            (m) => m.procedureOfEntityRoutes,
          ),
      },
      {
        // UNE PROCÉDURE — le fil d'une clôture, en quatre onglets qui se
        // déverrouillent ; leur état est relu au serveur, jamais stocké.
        // `:id` = entité × clôture. Les gestes demandent `b2b_accounting:write`.
        // Plan : documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md (P2, § 11).
        path: 'procedure-de-prelevement/:id',
        title: 'Procédure de prélèvement — LFC B2B admin',
        loadComponent: () =>
          import('./procedure-de-prelevement/procedure-de-prelevement-page').then(
            (m) => m.ProcedureDePrelevementPage,
          ),
      },
      {
        // LE MOIS DU PRÉLÈVEMENT, de haut en bas : son calendrier, l'aperçu de
        // ce qui sera prélevé, le lot à déposer, l'historique. Les gestes
        // demandent `b2b_accounting:write`.
        // Plan : documentation/comptabilite/prelevement/prelevement-automatique.md (PA4).
        path: 'prelevement-du-mois',
        title: 'Prélèvement du mois — LFC B2B admin',
        loadComponent: () =>
          import('./prelevement-du-mois/prelevement-du-mois-page').then(
            (m) => m.PrelevementDuMoisPage,
          ),
      },
      {
        // LE PRÉLÈVEMENT D'ESSAI — un pain.008 d'un débit sur un de nos
        // établissements. Sous `collection_test`, PAS `b2b_accounting` seul :
        // la vue porte son garde. Les gestes demandent `collection_test:write`.
        // Plan : documentation/comptabilite/prelevement/plan-prelevement-d-essai.md.
        path: 'prelevement-d-essai',
        canActivate: [permissionGuard('collection_test:read')],
        title: "Prélèvement d'essai — LFC B2B admin",
        loadComponent: () =>
          import('./prelevement-d-essai/prelevement-d-essai-page').then(
            (m) => m.PrelevementDEssaiPage,
          ),
      },
      {
        // NOS ÉTABLISSEMENTS — les sociétés à nous (Q1), et la décision écrite
        // de pré-notification (Q6). Même garde que l'outil d'essai.
        path: 'nos-etablissements',
        canActivate: [permissionGuard('collection_test:read')],
        title: 'Nos établissements — LFC B2B admin',
        loadComponent: () =>
          import('./nos-etablissements/nos-etablissements-page').then(
            (m) => m.NosEtablissementsPage,
          ),
      },
      // L'ancienne adresse vit dans des favoris : remplacée le 2026-10-08 (PA4).
      { path: 'lots-de-prelevement', redirectTo: 'prelevement-du-mois' },
      {
        // UNE facture émise, figée (facture-emise.md),
        // ouverte depuis l'onglet « Facturation » de la fiche client.
        path: 'factures/:id',
        title: 'Facture — LFC B2B admin',
        loadComponent: () =>
          import('./facture-emise/facture-emise-page').then((m) => m.FactureEmisePage),
      },
      {
        // Le dossier d'UNE ligne de prélèvement : son arrêté figé, ouvert
        // depuis le lot. Sous `b2b_accounting`, comme la coquille ; la route
        // serveur n'admet que ce droit, en lecture.
        // Plan : documentation/comptabilite/facturation/le-prelevement-suit-la-facture.md (F4).
        path: 'arretes-de-facturation/:id',
        title: 'Arrêté de facturation — LFC B2B admin',
        loadComponent: () =>
          import('./arrete-de-facturation/arrete-de-facturation-page').then(
            (m) => m.ArreteDeFacturationPage,
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
      // La FIDÉLITÉ a quitté cet espace le 2026-10-16 pour Gestion Boutique,
      // sous son droit `lfc_loyalty` : son écran est `/fidelite`, et
      // `/comptabilite/fidelite` y redirige HORS de cette coquille (dans
      // `app.routes.ts`) — sans quoi qui n'a que `lfc_loyalty` serait refusé.
      // Plan : documentation/comptabilite/fidelite/plan-fidelite-en-gestion-boutique.md, F2.
      {
        // Les limites de prix, pro et publiques. Elles relèvent de
        // `lfc_price_limits`, PAS de `b2b_accounting` : la vue porte donc son
        // propre garde, comme l'annonce l'en-tête de ce fichier. Les gestes
        // demandent `lfc_price_limits:write` ; l'écran les masque sans lui.
        // Plan : documentation/comptabilite/prix/limites-de-prix.md.
        path: 'limites-de-prix',
        canActivate: [permissionGuard('lfc_price_limits:read')],
        title: 'Limites de prix — LFC B2B admin',
        loadComponent: () =>
          import('./limites-de-prix/limites-de-prix-page').then((m) => m.LimitesDePrixPage),
      },
      {
        // La surtaxe de retard — ce qu'une dérogation coûte. Venue des Réglages
        // le 2026-09-29 avec son propre droit, `b2b_late_fee` (Hugo) : ni
        // `b2b_settings`, ni `b2b_accounting`. Enregistrer demande
        // `b2b_late_fee:write` ; l'écran masque le bouton sans lui.
        path: 'surtaxe-de-retard',
        canActivate: [permissionGuard('b2b_late_fee:read')],
        title: 'Surtaxe de retard — LFC B2B admin',
        loadComponent: () =>
          import('./order-late-fee/order-late-fee-page').then((m) => m.OrderLateFeePage),
      },
      {
        // La TVA de la livraison — taux normal ou au prorata des produits.
        // Sous `b2b_accounting`, comme la coquille : pas de garde propre. Les
        // gestes demandent `b2b_accounting:write` ; l'écran les masque sans lui.
        // Plan : documentation/commandes/architecture-tva-des-frais-de-port.md (V2).
        path: 'tva-de-la-livraison',
        title: 'TVA de la livraison — LFC B2B admin',
        loadComponent: () =>
          import('./order-delivery-vat/order-delivery-vat-page').then(
            (m) => m.OrderDeliveryVatPage,
          ),
      },
      {
        // Le dossier de facturation SIMULÉ d'un payeur pour un cycle : la
        // facture en une fois, les bons, les écarts. Sous `b2b_accounting`,
        // comme la coquille ; la route serveur n'admet que ce droit.
        // Plan : documentation/comptabilite/facturation/simulateur-dossier-de-facturation.md (DF4).
        path: 'dossier-de-facturation',
        title: 'Dossier de facturation — LFC B2B admin',
        loadComponent: () =>
          import('./invoice-dossier/invoice-dossier-page').then((m) => m.InvoiceDossierPage),
      },
      {
        // La PLANCHE DES DOCUMENTS : les bons et la facture rendus à partir de
        // données d'exemple fixes, pour un contrôle visuel. Sous
        // `b2b_accounting`, comme la coquille ; les routes serveur aussi.
        // Doc : documentation/comptabilite/planche-des-documents.md.
        path: 'planche-des-documents',
        title: 'Planche des documents — LFC B2B admin',
        loadComponent: () =>
          import('./document-specimens/document-specimens-page').then(
            (m) => m.DocumentSpecimensPage,
          ),
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
