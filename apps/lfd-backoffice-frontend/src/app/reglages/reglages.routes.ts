import { type ActivatedRouteSnapshot, type Routes } from '@angular/router';
import { legalMentionLabels } from '@lfd/contracts/content-values';

import { anyPermissionGuard, permissionGuard } from '../auth/permission.guard';
import { firstReglagesView } from './first-reglages-view';
import { legalMentionOfSlug } from './legal-mention-slugs';

/**
 * L'onglet d'une mention : son nom consacré, jamais le segment brut.
 *
 * Le titre vient du CONTRAT et non du document lu : il est posé avant tout
 * appel, et un onglet qui attendrait la réponse du serveur afficherait l'URL
 * pendant ce temps.
 *
 * ⚠️ Une mention hors vocabulaire dit « Mention inconnue », **le même mot que
 * l'écran**. Le repli a d'abord été « Mentions légales », pensé comme le nom du
 * groupe — sauf que c'est EXACTEMENT le libellé de `legalNotice` : l'onglet
 * devenait indiscernable d'une vraie page pendant que la page, elle, refusait
 * d'afficher quoi que ce soit (corrigé le 2026-09-13, vu à l'écran).
 */
export function legalMentionTitle(route: ActivatedRouteSnapshot): string {
  const known = legalMentionOfSlug(route.paramMap.get('mention') ?? '');
  return `${known === null ? 'Mention inconnue' : legalMentionLabels.fr[known]} — LFC B2B admin`;
}

/**
 * Les **Réglages** : Réglages › Sites (lot S1 du plan des sites, 2026-10-13),
 * Réglages › Commandes (`plan-reglages-commandes.md`, lot O1b, 2026-10-13),
 * Réglages › Commercial (Hugo, 2026-10-13, venu de l'espace Commercial),
 * Réglages › Légal (Hugo, 2026-10-15, venu de E-commerce › Contenu),
 * et les anciennes adresses des écrans partis le 2026-10-10.
 */
export const reglagesRoutes: Routes = [
  {
    path: 'reglages',
    // La coquille de l'Exploitation — renommée « Réglages » à l'écran le
    // 2026-10-10 : elle publie son rail et ne dessine rien. Pas de garde ici :
    // chaque écran porte le sien, et les redirections mènent à des
    // destinations qui portent le leur.
    loadComponent: () =>
      import('../production/production-workspace/production-workspace-page').then(
        (m) => m.ProductionWorkspacePage,
      ),
    children: [
      // `/reglages` mène à la PREMIÈRE vue des Réglages que ces droits ouvrent,
      // dans l'ordre du rail (Commandes, Production, Livraison, Commercial,
      // Sites — Hugo, 2026-10-13). Sans aucune, l'ancienne destination.
      { path: '', pathMatch: 'full', redirectTo: firstReglagesView },

      // Le catalogue et la tarification B2B ont DÉMÉNAGÉ dans l'espace B2B : on
      // ne va pas dans les réglages pour travailler. Les anciennes adresses
      // redirigent — elles vivent dans des favoris et des liens collés, et un
      // rangement qui rend 404 se paie par celui qui ne l'a pas fait.
      //
      // Les redirections sont ici, DANS les enfants de `reglages`, et non au
      // niveau racine : le routeur entre d'abord dans cette route parente, et
      // ce qu'il y cherche doit s'y trouver.
      { path: 'catalogue', redirectTo: '/catalogue-publie' },
      { path: 'tarification', pathMatch: 'full', redirectTo: '/promotions' },
      { path: 'tarification/frise', redirectTo: '/promotions/frise' },
      { path: 'tarification/simulateur', redirectTo: '/promotions/simulateur' },
      // « Retraits & livraisons » a suivi, découpé en trois pages de
      // « E-commerce LFC → Réglages ». L'ancienne adresse mène à la première.
      // Elle menait aux points de retrait, devenus les sites (S1, 2026-10-13).
      { path: 'retraits-livraisons', redirectTo: '/reglages/sites' },

      // La surtaxe de retard est partie en Comptabilité, sous son propre droit
      // `b2b_late_fee` (Hugo, 2026-09-29). Absolue, sans quoi elle resterait
      // sous le mur `b2b_settings` de ce parent.
      { path: 'surtaxe-de-retard', redirectTo: '/comptabilite/surtaxe-de-retard' },

      // Partis le 2026-10-10 (Hugo) : la facturation explique, elle va à la
      // Documentation ; les réglages commerciaux vont à l'Exploitation.
      { path: 'facturation', redirectTo: '/documentation/facturation' },

      // RÉGLAGES › SITES — nos lieux, leurs rôles, leurs couleurs. Sous SON
      // droit, `lfc_site_settings` (Hugo, Q-S5, 2026-10-13), comme l'API
      // `admin/sites` qu'il appelle.
      {
        path: 'sites',
        canActivate: [permissionGuard('lfc_site_settings:read')],
        title: 'Sites — LFC B2B admin',
        loadComponent: () => import('./sites/sites-page/sites-page').then((m) => m.SitesPage),
      },
      {
        // AVANT `:id` : sans cela `nouveau` se lirait comme un identifiant.
        path: 'sites/nouveau',
        canActivate: [permissionGuard('lfc_site_settings:write')],
        title: 'Nouveau site — LFC B2B admin',
        loadComponent: () => import('./sites/site-page/site-page').then((m) => m.SitePage),
      },
      {
        // Une page et non un panneau : identité, rôles, couleurs, heures,
        // créneaux, réduction, archivage — on va droit à l'un d'eux.
        path: 'sites/:id',
        canActivate: [permissionGuard('lfc_site_settings:read')],
        title: 'Site — LFC B2B admin',
        loadComponent: () => import('./sites/site-page/site-page').then((m) => m.SitePage),
      },

      // RÉGLAGES › COMMANDES — peut-on commander, jusqu'à quand, peut-on
      // revenir dessus (plan-reglages-commandes.md, §3). Deux droits :
      // l'interrupteur sous `lfc_order_opening`, l'heure limite et
      // l'annulation sous `lfc_order_settings`, comme les routes serveur.
      // La section mène à l'heure limite : la vue que commercial,
      // comptabilité et dev liront (§3.3).
      { path: 'commandes', pathMatch: 'full', redirectTo: '/reglages/commandes/heure-limite' },
      {
        path: 'commandes/ouverture',
        canActivate: [permissionGuard('lfc_order_opening:read')],
        title: 'Ouverture du e-commerce — LFC B2B admin',
        loadComponent: () =>
          import('./commandes/order-opening-page/order-opening-page').then(
            (m) => m.OrderOpeningPage,
          ),
      },
      {
        path: 'commandes/heure-limite',
        canActivate: [permissionGuard('lfc_order_settings:read')],
        title: 'Heure limite de commande — LFC B2B admin',
        loadComponent: () =>
          import('./commandes/order-cutoffs-page/order-cutoffs-page').then(
            (m) => m.OrderCutoffsPage,
          ),
      },
      {
        // Le jour même a sa page (Hugo, 2026-10-21, `plan-une-seule-heure.md`
        // §6) : même droit que l'heure limite qu'il quittait.
        path: 'commandes/jour-meme',
        canActivate: [permissionGuard('lfc_order_settings:read')],
        title: 'Jour même — LFC B2B admin',
        loadComponent: () =>
          import('./commandes/same-day-page/same-day-page').then((m) => m.SameDayPage),
      },
      {
        // Où le contrôle qualité se rend (Hugo, 2026-10-26,
        // `plan-controle-qualite.md` D10) : même droit que les voisins.
        path: 'commandes/controle-qualite',
        canActivate: [permissionGuard('lfc_order_settings:read')],
        title: 'Contrôle qualité — LFC B2B admin',
        loadComponent: () =>
          import('./commandes/quality-control-page/quality-control-page').then(
            (m) => m.QualityControlPage,
          ),
      },
      {
        path: 'commandes/annulation',
        canActivate: [permissionGuard('lfc_order_settings:read')],
        title: 'Annulation de commande — LFC B2B admin',
        loadComponent: () =>
          import('./commandes/customer-cancellation-page/customer-cancellation-page').then(
            (m) => m.CustomerCancellationPage,
          ),
      },

      // RÉGLAGES › PRODUCTION (Hugo, 2026-10-13) — l'arrêt du plan et les
      // jours fermés (arret-du-plan.md, lot A1), venus de `/production/reglages`.
      // Une vue : la page n'a pas d'onglets. Lecture sous
      // `production_settings:read`, la page se fige sans `:write`.
      { path: 'production', pathMatch: 'full', redirectTo: '/reglages/production/fournil' },
      {
        path: 'production/fournil',
        canActivate: [permissionGuard('production_settings:read')],
        title: 'Réglages du fournil — LFC B2B admin',
        loadComponent: () =>
          import('../production/production-settings-page/production-settings-page').then(
            (m) => m.ProductionSettingsPage,
          ),
      },
      {
        // Les raccourcis du fournil — compter en plaques (plan
        // `fournil/plan-raccourcis-du-fournil.md`, S1, 2026-10-28). Même
        // droit que le fournil ; la page se fige sans `:write`.
        path: 'production/raccourcis',
        canActivate: [permissionGuard('production_settings:read')],
        title: 'Raccourcis du fournil — LFC B2B admin',
        loadComponent: () =>
          import('../production/batch-shortcuts-page/batch-shortcuts-page').then(
            (m) => m.BatchShortcutsPage,
          ),
      },

      // RÉGLAGES › LIVRAISON (Hugo, 2026-10-13) — ce qui SE RÈGLE de la
      // livraison, venu de `/livraison/` ; les écrans du jour y restent.
      // Mêmes droits qu'avant : `delivery_settings` pour la flotte, les bacs,
      // les contenances et le départ ; la disponibilité OU les frais pour les
      // zones, chaque carte ne se montrant qu'au sien.
      {
        path: 'livraison/vehicules',
        canActivate: [permissionGuard('delivery_settings:read')],
        title: 'Véhicules — LFC B2B admin',
        loadComponent: () =>
          import('../livraison/vehicles-page/vehicles-page').then((m) => m.VehiclesPage),
      },
      {
        path: 'livraison/bacs',
        canActivate: [permissionGuard('delivery_settings:read')],
        title: 'Bacs — LFC B2B admin',
        loadComponent: () => import('../livraison/bins-page/bins-page').then((m) => m.BinsPage),
      },
      {
        path: 'livraison/contenances',
        canActivate: [permissionGuard('delivery_settings:read')],
        title: 'Contenances — LFC B2B admin',
        loadComponent: () =>
          import('../livraison/bin-capacities-page/bin-capacities-page').then(
            (m) => m.BinCapacitiesPage,
          ),
      },
      {
        path: 'livraison/depart',
        canActivate: [permissionGuard('delivery_settings:read')],
        title: 'Point de départ — LFC B2B admin',
        loadComponent: () =>
          import('../livraison/departure-page/departure-page').then((m) => m.DeparturePage),
      },
      {
        path: 'livraison/zones',
        canActivate: [anyPermissionGuard('delivery_availability:read', 'delivery_fee:read')],
        title: 'Zones de livraison — LFC B2B admin',
        loadComponent: () =>
          import('../b2b/reglages/delivery-availability-page/delivery-availability-page').then(
            (m) => m.DeliveryAvailabilityPage,
          ),
      },

      // RÉGLAGES › COLISAGE (Hugo, 2026-10-25) — ce que le poste permet, dont
      // le partage d'une moitié de bac, fermé par défaut. Sous
      // `delivery_settings`, le droit des bacs et des contenances, comme la
      // route `admin/packing/settings`.
      {
        path: 'colisage',
        canActivate: [permissionGuard('delivery_settings:read')],
        title: 'Colisage — LFC B2B admin',
        loadComponent: () =>
          import('./colisage/packing-settings-page/packing-settings-page').then(
            (m) => m.PackingSettingsPage,
          ),
      },

      // RÉGLAGES › COMMERCIAL (Hugo, 2026-10-13) — venus de la section
      // « Réglages » de l'espace Commercial, mêmes droits que leurs routes
      // d'API : Disponibilité sous `b2b_commercial_appointment`, Marchés sous
      // `b2b_growth`, Alertes sous `b2b_commercial_alert`, Motifs sous
      // `b2b_request_reasons`. `pathMatch: 'full'` sur l'entrée : en préfixe,
      // elle avalerait ses propres vues et tournerait en boucle.
      { path: 'commercial', pathMatch: 'full', redirectTo: '/reglages/commercial/disponibilite' },
      {
        path: 'commercial/disponibilite',
        canActivate: [permissionGuard('b2b_commercial_appointment:read')],
        title: 'Disponibilité — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/disponibilite-page/disponibilite-page').then(
            (m) => m.DisponibilitePage,
          ),
      },
      {
        path: 'commercial/marches',
        canActivate: [permissionGuard('b2b_growth:read')],
        title: 'Marchés — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/marches-page/marches-page').then((m) => m.MarchesPage),
      },
      {
        path: 'commercial/alertes',
        canActivate: [permissionGuard('b2b_commercial_alert:read')],
        title: 'Alertes — LFC B2B admin',
        loadComponent: () =>
          import('./commercial/alertes-page/alertes-page').then((m) => m.AlertesPage),
      },
      {
        path: 'commercial/motifs-des-demandes',
        canActivate: [permissionGuard('b2b_request_reasons:read')],
        title: 'Motifs des demandes — LFC B2B admin',
        loadComponent: () =>
          import('../b2b/demandes/request-reasons-page/request-reasons-page').then(
            (m) => m.RequestReasonsPage,
          ),
      },

      // RÉGLAGES › LÉGAL (Hugo, 2026-10-15) — les six mentions légales,
      // venues de E-commerce › Contenu (`/b2b/contenu/mentions/<clé>`, qui
      // redirige). UN écran paramétré par son segment français
      // (`legal-mention-slugs.ts`) : elles ont la même forme, et six
      // composants auraient divergé au premier correctif. Sous LEUR droit,
      // `lfc_legal` (plan `legal/plan-cgv-par-audience.md`, C0) — elles ont
      // gardé `b2b_settings` le temps du déménagement, et le commercial voyait
      // une entrée « Réglages » ouvrir sur les mentions légales.
      {
        path: 'legal/:mention',
        canActivate: [permissionGuard('lfc_legal:read')],
        title: legalMentionTitle,
        loadComponent: () =>
          import('../contenu/mentions/mentions-page').then((m) => m.MentionsPage),
      },
    ],
  },
];
