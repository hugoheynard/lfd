import { type Routes } from '@angular/router';
import { NEW_VERSION_BANNER } from '@lfd/front-ops';

import { anyPermissionGuard, permissionGuard } from './auth/permission.guard';
import {
  ORDER_ENTRY_ORIGIN_KEY,
  type OrderEntryOrigin,
} from './commandes/nouvelle-commande/order-entry-origin';
import { pendingChangesGuard } from './pim/catalogue/product-form/pending-changes.guard';
import { DEV_TOOLS_ROUTES } from './dev/dev-tools';
import { adminRoutes } from './admin/admin.routes';
import { commercialRoutes } from './commercial/commercial.routes';
import { ficheClientRoutes, nouveauCompteRoutes } from './fiche-client/fiche-client.routes';
import { b2bRoutes } from './b2b/b2b.routes';
import { comptabiliteRoutes } from './comptabilite/comptabilite.routes';
import { pimRoutes } from './pim/pim.routes';
import { reglagesRoutes } from './reglages/reglages.routes';

/**
 * **L'assemblage des routes** — et, surtout, leur ORDRE.
 *
 * Les sections qui ont un sous-arbre (fiche client, admin, réglages, PIM,
 * commercial) vivent dans un fichier à elles, à côté de ce qu'elles chargent :
 * `pim/pim.routes.ts`, `commercial/commercial.routes.ts`… Le critère est la
 * présence d'ENFANTS, pas la longueur : une page seule n'a pas d'arbre à
 * raconter, et l'extraire ne ferait que déplacer dix lignes en cassant la carte
 * de l'application qu'on lit ici.
 *
 * Ce fichier garde donc ce qu'aucun fichier de section ne peut garantir : la
 * position relative des routes. Angular prend la PREMIÈRE qui correspond et ne
 * revient pas en arrière — trois ordres ci-dessous portent une garantie, et
 * chacun est commenté à l'endroit où il se joue.
 */
/**
 * Les gardes de la commande pro au comptoir : LIRE les clients du comptoir
 * (`b2b_counter:read`) ET passer une commande (`b2b_place_order:write`, sortie
 * de `b2b_orders` le 2026-10-01 — `documentation/livraisons/droits/plan-droits-par-geste.md`, 5.1 bis). L'un sans
 * l'autre ouvrirait un écran dont la moitié des appels répondrait 403
 * (`documentation/order/plan-commande-au-comptoir.md`, Front). Deux gardes
 * plutôt qu'un garde composé : chacun porte sa permission, que la table des
 * routes relit.
 */
const COUNTER_ORDER_GUARDS = [
  permissionGuard('b2b_counter:read'),
  permissionGuard('b2b_place_order:write'),
];

export const routes: Routes = [
  // LA RACINE (plan-ma-tournee.md, MT-D7 v2) : vers les comptes clients, dont
  // le garde renvoie qui n'y a pas droit vers sa première porte (`LANDINGS`) —
  // le livreur vers sa tournée. `comptes-clients` seul ne correspondait plus à
  // aucune route depuis qu'il est un onglet du Commercial (vérifié le 2026-10-01).
  { path: '', pathMatch: 'full', redirectTo: 'commercial/comptes-clients' },
  // ORDRE ① — avant `ficheClientRoutes` : sans cela « nouveau » serait lu comme
  // un identifiant de société, et la page afficherait « Société introuvable ».
  ...nouveauCompteRoutes,
  {
    // **Médiathèque** — le fonds d'images, indépendamment de ce qui l'affiche.
    //
    // Route de PREMIER niveau, hors de `pim/`, et c'est une affirmation sur le
    // modèle : les fiches portent des visuels, les familles aussi, et les
    // contenus de la vitrine en porteront. Aucun d'eux ne possède la
    // bibliothèque — le domaine le dit déjà (« ni l'un ni l'autre ne possède la
    // bibliothèque », `shared/domain/value-objects/media.ts`). La ranger sous
    // le référentiel lui donnerait un propriétaire qu'elle n'a pas.
    //
    // ⚠️ La route de l'ÉCRAN reste en français — `mediatheque` — et l'API est
    // passée à `/pim/media` le 2026-09-23. Ce n'est pas une incohérence : dans
    // ce dépôt, le français vit là où des humains lisent (les routes du
    // back-office disent déjà `produits`, `emplacements`, `contextes`,
    // `limites-de-commande`) et l'anglais dans le code et les contrats. On
    // dicte une adresse d'écran ; on n'épelle pas un chemin d'API.
    //
    // `media_library:read` : c'est le mur que la route serveur oppose
    // (`@AdminSurface("media_library")`). Ouvrir l'écran à qui ne l'a pas ne
    // montrerait que des 403. Ce garde demandait `pim_catalog:read` jusqu'au
    // 2026-10-02, trace du temps où le fonds vivait sous le référentiel.
    // L'écran n'appelle que `/media/*` ; le panneau « où sert cette image »
    // NAVIGUE vers les fiches, qui gardent leur propre droit (vérifié le
    // 2026-10-02).
    path: 'mediatheque',
    canActivate: [permissionGuard('media_library:read')],
    title: 'Médiathèque — LFC B2B admin',
    loadComponent: () =>
      import('./mediatheque/mediatheque-page/mediatheque-page').then((m) => m.MediathequePage),
  },
  {
    // **Vitrine** — composer les pages de la boutique. Route de PREMIER niveau,
    // hors de l'espace `b2b` : ce parent est gardé par `b2b_settings:read`, et
    // l'ouvrir à la communication, qui compose la vitrine, lui aurait ouvert
    // tous les onglets de l'espace (plan-vitrine-enregistrement.md, D7).
    // L'ancienne adresse `/b2b/contenu/vitrine` y redirige.
    //
    // `b2b_storefront:read` : le mur que la route serveur oppose
    // (`@AdminSurface("b2b_storefront")`). Enregistrer demande `:write`, que
    // l'écran lit pour ouvrir ou fermer son bouton.
    path: 'vitrine',
    canActivate: [permissionGuard('b2b_storefront:read')],
    canDeactivate: [pendingChangesGuard],
    title: 'Vitrine boutique — LFC B2B admin',
    loadComponent: () =>
      import('./contenu/storefront-page/storefront-page').then((m) => m.StorefrontPage),
  },
  {
    // **Outils agent** — l'écran est l'interrupteur : les outils WebMCP du
    // référentiel ne sont déclarés que par ce composant, donc ils n'existent
    // que tant qu'on est dessus. Route de premier niveau, hors de `pim/` : ce
    // n'est pas un écran du référentiel, c'est un atelier qui le pilote.
    //
    // Le garde demande l'ÉCRITURE, pas la lecture : ces outils écrivent.
    path: 'outils-agent',
    canActivate: [permissionGuard('pim_catalog:write')],
    title: 'Outils agent — LFC B2B admin',
    loadComponent: () =>
      import('./agent/agent-tools-page/agent-tools-page').then((m) => m.AgentToolsPage),
  },
  {
    // Le détail d'une commande vit AUSSI hors de la fiche client : une commande
    // « zéro friction » n'a pas d'entreprise, donc pas de fiche où la loger.
    //
    // ⚠️ Ce n'est plus le chemin par lequel on ouvre la commande D'UN COMPTE :
    // celle-là s'ouvre sous la coquille (`comptes-clients/:id/commandes/:orderId`)
    // pour ne pas faire perdre le bandeau et les onglets à qui parcourt un
    // dossier. Les deux écrans partagent leur corps, `app-order-view`.
    //
    // `:orderId` et non `:id` : les deux routes lient le même composant de
    // corps, et sous la coquille `:id` désigne déjà la société.
    path: 'commandes/:orderId',
    canActivate: [permissionGuard('b2b_orders:read')],
    title: 'Commande — LFC B2B admin',
    loadComponent: () =>
      import('./commandes/commande-page/commande-page').then((m) => m.AdminCommandePage),
  },
  {
    // PLEINE PAGE, hors de la coquille à onglets de la fiche : on y saisit une
    // commande pendant dix minutes, avec le client en ligne, et les trois
    // colonnes réclament toute la largeur. Des onglets à côté inviteraient à en
    // sortir en cours de saisie — et le panier ne survit pas à la navigation.
    path: 'comptes-clients/:id/nouvelle-commande',
    canActivate: [permissionGuard('b2b_place_order:write')],
    title: 'Nouvelle commande — LFC B2B admin',
    loadComponent: () =>
      import('./commandes/nouvelle-commande/nouvelle-commande-page').then(
        (m) => m.NouvelleCommandePage,
      ),
  },
  {
    // La carte de santé de l'écosystème. Route de premier niveau et courte : on
    // y va quand quelque chose cloche, souvent depuis un autre onglet, et
    // parfois en la dictant. `ops:read` et pas `settings:read` — regarder la
    // flotte n'est pas la régler.
    path: 'sante',
    canActivate: [permissionGuard('ops_health:read')],
    title: 'Santé de l’écosystème — LFC B2B admin',
    loadComponent: () => import('./ops/sante-page/sante-page').then((m) => m.SantePage),
  },
  {
    // 🔴 **Premier niveau, et ce n'est pas un choix d'arborescence.** Ce chemin
    // est une VALEUR : `production-paper.service.ts` l'encode dans le QR de
    // chaque feuille d'atelier, et ces feuilles sont imprimées, en circulation,
    // sur des plans de travail. Le ranger sous `/production/colisage/:reference`
    // ferait tomber en 404 tout le papier déjà sorti — on ne renomme pas une
    // valeur, on la migre (CLAUDE.md §8), et ici la migration coûterait un
    // réimprimage du fournil.
    //
    // Même forme que `retrait/:token` en dessous, et pour la même raison : le
    // segment est encodé dans un code-barres, donc chaque caractère de plus
    // densifie les modules et fragilise le scan.
    //
    // Ce qu'il porte n'est PAS un secret : le numéro de commande est imprimé en
    // clair sur la même feuille. C'est la porte staff qui protège, pas
    // l'ignorance du code — et ça suffit, parce que le colisage est un fait
    // interne, sans seconde partie à représenter.
    //
    // Le mur du colisage (`production_packing`, sorti de `b2b_orders` le
    // 2026-10-01) : scanner une feuille n'est pas un droit de plus.
    path: 'colisage/:reference',
    // 🔴 `:write`, et pas `:read` comme les vues voisines du fournil. Ce n'est
    // pas une incohérence à lisser : le poste de colisage ÉCRIT — il coche des
    // lignes et ferme des commandes, ce que le commerce apprend aussitôt. Une
    // porte en lecture y laisserait entrer quelqu'un à qui l'écran offrirait
    // des gestes que chaque appel refuserait ensuite (rétabli le 2026-09-13,
    // c'était la garde d'origine de cette route).
    canActivate: [permissionGuard('production_packing:write')],
    title: 'Colisage — LFC B2B admin',
    loadComponent: () => import('./production/colisage/colisage').then((m) => m.Colisage),
  },
  {
    // La cible d'un QR de retrait. Route de premier niveau et courte : elle est
    // encodée dans un code-barres, et parfois dictée au téléphone le jour où une
    // caméra refuse de lire. Chaque caractère de plus densifie les modules, donc
    // fragilise le scan — ce n'est pas de la coquetterie d'URL.
    path: 'retrait/:token',
    canActivate: [permissionGuard('handover_counter:write')],
    title: 'Retrait — LFC B2B admin',
    loadComponent: () => import('./retrait/retrait-page/retrait-page').then((m) => m.PickupPage),
  },
  // ORDRE ② — après `comptes-clients/:id/nouvelle-commande` ci-dessus. La fiche
  // n'a pas d'enfant `nouvelle-commande` ; si elle passait devant, Angular
  // s'engagerait dessus, échouerait sur l'enfant manquant, et ne reviendrait
  // pas en arrière.
  ...ficheClientRoutes,
  ...adminRoutes,
  ...reglagesRoutes,
  {
    // ANALYTICS — le module qui lit ce que le parc raconte.
    //
    // La croissance en est la première vue, sortie de Commercial : elle y était
    // rangée avec le travail du commercial (son cockpit, ses prospects, son
    // calendrier), alors qu'elle ne se consulte pas pour agir sur un dossier
    // mais pour comprendre un mouvement. Deux gestes différents, deux endroits.
    //
    // Une section à part et non une page : ce qui viendra ensuite — cohortes,
    // marges, saisonnalité — sont des VUES de la même question, et elles
    // demanderont des onglets plutôt qu'une entrée de rail chacune.
    // PLAT tant qu'il n'y a qu'une vue. Un shell à onglets pour un seul onglet
    // serait une coquille : il deviendra une section — comme Commercial —
    // quand la deuxième vue arrivera (cohortes, marges, saisonnalité), et pas
    // avant. Généraliser au SECOND usage, ici comme ailleurs.
    path: 'analytics',
    canActivate: [permissionGuard('b2b_growth:read')],
    title: 'Analytics — LFC B2B admin',
    loadComponent: () =>
      import('./analytics/croissance/croissance-page').then((m) => m.CroissancePage),
  },
  ...pimRoutes,
  ...b2bRoutes,
  ...comptabiliteRoutes,

  {
    // LA DOCUMENTATION — au pied du menu, avec les Réglages : on ne l'ouvre pas
    // pour travailler, on l'ouvre pour comprendre puis on repart. Elle était un
    // onglet du PIM, ce qui la réservait à qui a `catalog:read` et la noyait
    // parmi des écrans de travail. Sans garde : c'est de la prose sur le
    // fonctionnement du catalogue, pas une donnée.
    path: 'documentation',
    title: 'Documentation — LFC B2B admin',
    loadComponent: () =>
      import('./documentation/documentation-page').then((m) => m.DocumentationPage),
    // Chaque section a son URL. Elles étaient sept panneaux sur la même adresse,
    // ce qui interdisait d'envoyer un lien vers une explication — le geste le
    // plus courant qu'on fait avec de la documentation.
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'parametrage-general' },
      {
        // Venue des Réglages le 2026-10-10 (Hugo) : elle explique comment un
        // prix se fabrique, elle ne règle rien.
        path: 'facturation',
        title: 'Facturation — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/facturation/reglages-facturation-page').then(
            (m) => m.ReglagesFacturationPage,
          ),
      },
      {
        // EN PREMIER, et c'est le sens de lecture : rien du référentiel ne se
        // comprend sans le contexte de vente et le point de vente, qui viennent
        // eux-mêmes de la loi et non d'un choix produit.
        path: 'parametrage-general',
        title: 'Paramétrage général — LFC B2B admin',
        loadComponent: () =>
          import('./documentation/pim/general-settings-page/general-settings-page').then(
            (m) => m.DocGeneralSettingsPage,
          ),
      },
      {
        // Juste après le paramétrage général, et pour la même raison d'ordre :
        // une fiche produit ne cite que du vocabulaire déjà écrit.
        path: 'parametrage-produit',
        title: 'Paramétrage produit — LFC B2B admin',
        loadComponent: () =>
          import('./documentation/pim/product-settings-page/product-settings-page').then(
            (m) => m.DocProductSettingsPage,
          ),
      },
      {
        // Après le paramétrage produit : une fiche ne fait que citer un
        // vocabulaire écrit ailleurs, et l'expliquer avant obligerait à renvoyer
        // à chaque paragraphe vers des référentiels pas encore lus.
        path: 'remplir-une-fiche-produit',
        title: 'Remplir une fiche produit — LFC B2B admin',
        loadComponent: () =>
          import('./documentation/pim/product-sheet-page/product-sheet-page').then(
            (m) => m.DocProductSheetPage,
          ),
      },
      {
        path: 'vue-d-ensemble',
        title: 'Vue d’ensemble — LFC B2B admin',
        loadComponent: () =>
          import('./documentation/pim/overview-page/overview-page').then((m) => m.DocOverviewPage),
      },
      {
        path: 'briques',
        title: 'Les briques — LFC B2B admin',
        loadComponent: () =>
          import('./documentation/pim/bricks-page/bricks-page').then((m) => m.DocBricksPage),
      },
      {
        path: 'segmentation-web',
        title: 'Segmentation web — LFC B2B admin',
        loadComponent: () =>
          import('./documentation/pim/web-segmentation-page/web-segmentation-page').then(
            (m) => m.DocWebSegmentationPage,
          ),
      },
    ],
  },
  // LE COURSIER (2026-10-03) : la page du livreur, espace de PREMIER niveau,
  // sans rail secondaire — il n'a qu'une vue, et son chargement en est la
  // suite. Sous son seul droit ; c'est aussi son atterrissage (`LANDINGS`).
  {
    path: 'coursier',
    canActivate: [permissionGuard('delivery_driving:read')],
    title: 'Coursier — LFC B2B admin',
    // Un livreur en tournée ne voit pas son écran repartir de zéro : bandeau.
    data: { newVersion: NEW_VERSION_BANNER },
    loadComponent: () =>
      import('./livraison/my-round-page/my-round-page').then((m) => m.MyRoundPage),
  },
  // « MES DONNÉES » (2026-10-06, `documentation/legal/rgpd-livreur.md` §7) : le
  // texte d'information du livreur, à relire — sous le même droit que la page.
  {
    path: 'coursier/mes-donnees',
    canActivate: [permissionGuard('delivery_driving:read')],
    title: 'Mes données — LFC B2B admin',
    // Un livreur en tournée ne voit pas son écran repartir de zéro : bandeau.
    data: { newVersion: NEW_VERSION_BANNER },
    loadComponent: () =>
      import('./livraison/driver-notice-page/driver-notice-page').then((m) => m.DriverNoticePage),
  },
  // LE COLISAGE (2026-10-04, `documentation/colisage/colisage.md`,
  // P0) : un poste de PREMIER niveau, comme le Coursier — ses données restent
  // au fournil, mais le geste n'en est pas une vue. Le même composant que
  // `colisage/:reference` : le poste ouvert sur la liste plutôt que sur une
  // commande. Le chemin exact ne masque pas la route du QR, qui exige un segment.
  {
    path: 'colisage',
    pathMatch: 'full',
    canActivate: [permissionGuard('production_packing:read')],
    title: 'Colisage — LFC B2B admin',
    loadComponent: () => import('./production/colisage/colisage').then((m) => m.Colisage),
  },
  // L'EXPLOITATION a ses propres écrans depuis le 2026-10-10 : les réglages
  // commerciaux, venus des Réglages. Même coquille que la Production — elle
  // publie le rail de l'Exploitation et ne dessine rien.
  {
    path: 'exploitation',
    loadComponent: () =>
      import('./production/production-workspace/production-workspace-page').then(
        (m) => m.ProductionWorkspacePage,
      ),
    children: [
      {
        path: 'commercial',
        canActivate: [permissionGuard('b2b_growth:read')],
        title: 'Réglages commerciaux — LFC B2B admin',
        loadComponent: () =>
          import('./reglages/commercial/reglages-commercial-page').then(
            (m) => m.ReglagesCommercialPage,
          ),
      },
    ],
  },
  // PROD MANAGER (Hugo, 2026-10-10) : le prévisionnel sort de l'Exploitation
  // pour une entrée de premier niveau, juste au-dessus du Fournil — on regarde
  // ce qui tombe avant de lancer la fournée. L'ancienne adresse redirige.
  {
    path: 'prod-manager',
    canActivate: [permissionGuard('production_plan:read')],
    title: 'Prod manager — LFC B2B admin',
    loadComponent: () =>
      import('./production/previsionnel/previsionnel-page').then((m) => m.PrevisionnelPage),
  },
  // TOUR MANAGER (Hugo, 2026-10-10) : l'organisation des tournées sort de la
  // Livraison pour une entrée de premier niveau, sous Prod manager.
  {
    path: 'tour-manager',
    canActivate: [permissionGuard('delivery_rounds:read')],
    title: 'Tour manager — LFC B2B admin',
    loadComponent: () => import('./livraison/rounds-page/rounds-page').then((m) => m.RoundsPage),
  },
  // LE FOURNIL (2026-10-06) : la fournée du jour sort de la Production pour
  // devenir un poste de premier niveau, comme le Colisage — la fiche d'atelier
  // se prend dans le fournil, sur un téléphone, pas depuis un rail d'espace.
  // Le titre d'écran reste « Fournée du jour » : c'est ce qu'il montre.
  {
    path: 'fournil',
    canActivate: [permissionGuard('production_worksheet:read')],
    title: 'Fournée du jour — LFC B2B admin',
    loadComponent: () =>
      import('./production/fiche-atelier/fiche-atelier').then((m) => m.FicheAtelier),
  },
  // CHARGER MA TOURNÉE : le chargement du livreur a sa propre adresse, sous
  // le même droit — un rechargement le rouvre.
  {
    path: 'coursier/:roundId/chargement',
    canActivate: [permissionGuard('delivery_driving:read')],
    title: 'Charger ma tournée — LFC B2B admin',
    // Un livreur en tournée ne voit pas son écran repartir de zéro : bandeau.
    data: { newVersion: NEW_VERSION_BANNER },
    loadComponent: () =>
      import('./livraison/my-round-loading/my-round-loading').then((m) => m.MyRoundLoading),
  },
  {
    // LA LIVRAISON est un ESPACE (plan-preparation-de-tournee.md, lot 2). La
    // coquille ne porte AUCUN garde : chaque vue relève de son propre droit, et
    // un garde commun fermerait la flotte à qui ne lit que la feuille de route
    // — ou l'inverse. Le garde est donc sur chaque enfant.
    path: 'livraison',
    loadComponent: () =>
      import('./livraison/livraison-workspace/livraison-workspace-page').then(
        (m) => m.LivraisonWorkspacePage,
      ),
    children: [
      // `/livraison` reste l'adresse de la feuille de route : elle vit dans des
      // favoris. Une redirection et non un écran à vide : le rail marque actif
      // tout lien dont l'URL est le préfixe, et un lien `/livraison` le serait
      // resté sur les deux autres vues.
      { path: '', pathMatch: 'full', redirectTo: 'feuille-de-route' },
      {
        path: 'feuille-de-route',
        canActivate: [permissionGuard('delivery_run_sheet:read')],
        title: 'Feuille de route — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/livraison-page/livraison-page').then((m) => m.DeliveryPage),
      },
      // « MA TOURNÉE » A DÉMÉNAGÉ sous `/coursier` (2026-10-03) : un espace à
      // part, que le livreur voit sans la Livraison. Les anciennes adresses
      // vivent dans des favoris et des liens — elles redirigent.
      { path: 'ma-tournee', pathMatch: 'full', redirectTo: '/coursier' },
      {
        path: 'ma-tournee/:roundId/chargement',
        redirectTo: '/coursier/:roundId/chargement',
      },
      // Devenue « Tour manager », au premier niveau (2026-10-10) : favoris et
      // liens portent `?jour=`, que la redirection garde.
      { path: 'tournees', pathMatch: 'full', redirectTo: '/tour-manager' },
      // « NON REMIS » (a-la-porte.md, AP-D7) : une LECTURE, sous le droit
      // des tournées — c'est leur suite, et elle ne débloque rien.
      {
        path: 'non-remis',
        canActivate: [permissionGuard('delivery_rounds:read')],
        title: 'Non remis — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/undelivered-page/undelivered-page').then((m) => m.UndeliveredPage),
      },
      // « À DÉCIDER » (a-la-porte.md, B3) : la réponse du COMMERCIAL à un
      // problème à la porte, sous son droit : la page s'ouvre en lecture et
      // n'offre les réponses qu'en écriture (2026-10-07, audit Q5 ;
      // `b2b_companies:write` jusqu'au 2026-10-02) — la cible du lien de la notification « arrêt à décider ».
      {
        path: 'a-decider',
        canActivate: [permissionGuard('delivery_decisions:read')],
        title: 'À décider — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/decisions-page/decisions-page').then((m) => m.DecisionsPage),
      },
      // « CARNET À CORRIGER » (gps-y-aller-et-position.md, §6) : sous
      // `delivery_rounds:write`, LECTURE COMPRISE — la liste est tirée des
      // positions des livreurs, et seul qui organise les tournées la voit.
      {
        path: 'carnet-a-corriger',
        canActivate: [permissionGuard('delivery_rounds:write')],
        title: 'Carnet à corriger — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/address-suggestions-page/address-suggestions-page').then(
            (m) => m.AddressSuggestionsPage,
          ),
      },
      // LE SIMULATEUR (lot 9, L9-C1) : une LECTURE, sous le même droit que
      // « Proposer » au lot 7 — rien n'est écrit.
      {
        path: 'simulateur',
        canActivate: [permissionGuard('delivery_rounds:read')],
        title: 'Simulateur de tournée — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/simulator-page/simulator-page').then((m) => m.SimulatorPage),
      },
      // L'ASSISTANT D'ACHAT (plan-geometrie-du-plancher.md, G3) : une LECTURE,
      // sous le droit du simulateur (G-D3 : « pas de droit neuf »).
      {
        path: 'assistant-achat',
        canActivate: [permissionGuard('delivery_rounds:read')],
        title: 'Assistant d’achat — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/purchase-assistant-page/purchase-assistant-page').then(
            (m) => m.PurchaseAssistantPage,
          ),
      },
      // LE CHARGEMENT (lot 4) : tout se LIT sous `delivery_loading:read` —
      // ouvrir un sac, une tournée, les étiquettes n'écrit rien (L4-C13, L4-C16).
      // Charger, décharger, partir, déclarer : des gestes, que chaque écran ne
      // montre qu'avec `delivery_loading:write`, et que le serveur refuse sans.
      {
        path: 'chargement',
        canActivate: [permissionGuard('delivery_loading:read')],
        title: 'Chargement — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/loading-page/loading-page').then((m) => m.LoadingPage),
      },
      {
        path: 'chargement/:roundId',
        canActivate: [permissionGuard('delivery_loading:read')],
        title: 'Chargement d’une tournée — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/loading-round-page/loading-round-page').then(
            (m) => m.LoadingRoundPage,
          ),
      },
      {
        // L'adresse qu'encode le QR d'un bac (ou d'une moitié) : un appareil
        // photo natif l'ouvre. `sac/:bagId` n'existe plus (lot 4 bis, v2-6 :
        // le lot 4 n'a jamais été servi, le renommage est franc).
        //
        // La fiche se LIT sous le colisage OU le chargement, en lecture
        // (2026-10-02) — le même `@RequireAnyPermission` que son `GET`
        // serveur. Annuler un bac reste une écriture, côté serveur.
        path: 'bac/:binId',
        canActivate: [anyPermissionGuard('production_packing:read', 'delivery_loading:read')],
        title: 'Bac — LFC B2B admin',
        loadComponent: () => import('./livraison/bin-page/bin-page').then((m) => m.BinPage),
      },
      {
        // Les étiquettes lisent la liste des bacs d'une commande, qui est le
        // PANNEAU du geste : le serveur l'ouvre sous `production_packing:write`
        // OU `delivery_loading:write` (plan des droits par geste §5.3). La
        // route demande la même chose, sans quoi elle s'ouvrirait sur un 403
        // (aligné le 2026-10-02).
        path: 'etiquettes/:orderId',
        canActivate: [anyPermissionGuard('production_packing:write', 'delivery_loading:write')],
        title: 'Étiquettes des bacs — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/bin-labels-page/bin-labels-page').then((m) => m.BinLabelsPage),
      },
      {
        path: 'vehicules',
        canActivate: [permissionGuard('delivery_settings:read')],
        title: 'Véhicules — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/vehicles-page/vehicles-page').then((m) => m.VehiclesPage),
      },
      // LES BACS (lot 4 bis, tranche A) : des RÉGLAGES, sous le droit des
      // réglages comme les véhicules. Le serveur ouvre aussi leur lecture à
      // `delivery_rounds:read` pour les écrans qui la consomment ; ces deux
      // écrans-ci sont ceux où l'on règle.
      {
        path: 'bacs',
        canActivate: [permissionGuard('delivery_settings:read')],
        title: 'Bacs — LFC B2B admin',
        loadComponent: () => import('./livraison/bins-page/bins-page').then((m) => m.BinsPage),
      },
      {
        path: 'contenances',
        canActivate: [permissionGuard('delivery_settings:read')],
        title: 'Contenances — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/bin-capacities-page/bin-capacities-page').then(
            (m) => m.BinCapacitiesPage,
          ),
      },
      {
        path: 'depart',
        canActivate: [permissionGuard('delivery_settings:read')],
        title: 'Point de départ — LFC B2B admin',
        loadComponent: () =>
          import('./livraison/departure-page/departure-page').then((m) => m.DeparturePage),
      },
      // LES ZONES ET LA DISPONIBILITÉ DE LA LIVRAISON, venues des réglages de
      // l'e-commerce (Hugo, 2026-10-10), sous leurs deux droits : la page
      // s'ouvre à l'un OU l'autre, chaque carte ne se montre qu'au sien.
      {
        path: 'zones',
        canActivate: [anyPermissionGuard('delivery_availability:read', 'delivery_fee:read')],
        title: 'Zones de livraison — LFC B2B admin',
        loadComponent: () =>
          import('./b2b/reglages/delivery-availability-page/delivery-availability-page').then(
            (m) => m.DeliveryAvailabilityPage,
          ),
      },
    ],
  },
  {
    // L'APP MOBILE — il n'y en a pas à télécharger : c'est cette adresse-ci,
    // ajoutée à l'écran d'accueil. Sans garde, comme la documentation : la page
    // ne montre qu'un QR de sa propre origine et le mode d'emploi.
    path: 'app-mobile',
    title: 'Obtenir l’app mobile — LFC B2B admin',
    loadComponent: () =>
      import('./app-mobile/app-mobile-page/app-mobile-page').then((m) => m.AppMobilePage),
  },
  {
    // L'ANCIENNE FILE DE RETRAIT — devenue la vue `retrait` de l'espace Comptoir.
    //
    // ⚠️ Le chemin `remises` est une VALEUR : les signets du personnel pointent
    // dessus, et une valeur n'est pas un nom (CLAUDE.md §8). Il redirige donc,
    // il ne disparaît pas.
    //
    // ⚠️ Elle ne remplace PAS `retrait/:token`, et ne peut pas : ce chemin-là
    // est ce que les QR déjà partis en courriel encodent. Celui-ci est la file
    // qu'on ouvre le matin ; l'autre est la cible d'un scan.
    path: 'remises',
    pathMatch: 'full',
    redirectTo: 'comptoir/retrait',
  },
  {
    // LA SUPERVISION DU JOUR — une VUE, pas un espace de travail : elle regarde
    // la production, le colisage et le retrait sans rien y faire. D'où le
    // premier niveau, hors de Production et de Comptoir, et un droit à elle
    // (`documentation/order/plan-supervision-du-jour.md`, Front).
    path: 'supervision',
    canActivate: [permissionGuard('b2b_supervision:read')],
    title: 'Supervision du jour — LFC B2B admin',
    loadComponent: () =>
      import('./supervision/supervision-page/supervision-page').then((m) => m.SupervisionPage),
  },
  {
    // LE COMPTOIR — un ESPACE de travail : ce qui se fait quand le client est
    // devant nous. Rendre une commande (la file de retrait) et en prendre une
    // pour un pro (recherche du compte, puis l'écran de saisie du Commercial).
    //
    // La coquille n'est PAS gardée depuis le 2026-10-01, comme la Livraison :
    // ses deux gestes relèvent de deux droits (`handover_counter`,
    // `b2b_place_order`), et un garde commun fermerait l'un à qui ne tient que
    // l'autre. Chaque vue porte le sien — un favori atterrit sur une vue.
    path: 'comptoir',
    loadComponent: () =>
      import('./comptoir/comptoir-workspace/comptoir-workspace-page').then(
        (m) => m.ComptoirWorkspacePage,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'retrait' },
      {
        path: 'retrait',
        canActivate: [permissionGuard('handover_counter:read')],
        title: 'Retrait boutique — LFC B2B admin',
        loadComponent: () =>
          import('./handover-shop/handover-shop-page/handover-shop-page').then(
            (m) => m.HandoverShopPage,
          ),
      },
      {
        path: 'nouvelle-commande',
        canActivate: COUNTER_ORDER_GUARDS,
        title: 'Nouvelle commande pro — LFC B2B admin',
        loadComponent: () =>
          import('./comptoir/nouvelle-commande-pro/nouvelle-commande-pro-page').then(
            (m) => m.NouvelleCommandeProPage,
          ),
      },
      {
        // LA SAISIE, montée SOUS le comptoir : la personne du comptoir n'a pas
        // forcément les droits du Commercial, et la navigation doit rester
        // enfermée ici. Même composant que `comptes-clients/:id/nouvelle-commande` ;
        // c'est l'origine déclarée en `data` qui referme ses liens sur `/comptoir`.
        path: 'nouvelle-commande/:id',
        canActivate: COUNTER_ORDER_GUARDS,
        title: 'Nouvelle commande pro — LFC B2B admin',
        data: { [ORDER_ENTRY_ORIGIN_KEY]: 'counter' satisfies OrderEntryOrigin },
        loadComponent: () =>
          import('./commandes/nouvelle-commande/nouvelle-commande-page').then(
            (m) => m.NouvelleCommandePage,
          ),
      },
    ],
  },
  {
    // LA PRODUCTION — un ESPACE de travail, et non plus une page. Deux vues, et
    // ce sont deux questions : la journée dit ce qu'on fabrique maintenant, le
    // prévisionnel dit quand ça tombe. La coquille ne dessine rien ; elle
    // publie le rail secondaire, et chaque vue garde son propre sommet.
    //
    // La coquille n'est PAS gardée depuis le 2026-10-01 (`documentation/livraisons/droits/plan-droits-par-geste.md`,
    // DG-D1), comme la Livraison : le plan du soir, la fiche d'atelier et le
    // colisage sont trois droits, et un garde commun fermerait une vue à qui
    // ne tient que l'autre. Chaque vue porte le sien — une URL tapée ou un
    // favori de poste de labo atterrit toujours sur une vue gardée.
    path: 'production',
    loadComponent: () =>
      import('./production/production-workspace/production-workspace-page').then(
        (m) => m.ProductionWorkspacePage,
      ),
    children: [
      // `/production` reste une adresse valide. Elle menait à la fournée ; la
      // fournée est partie au Fournil (2026-10-06), et l'entrée Production
      // ouvre désormais sa première vue. Qui ne tient que la fiche d'atelier
      // est renvoyé par le garde vers son atterrissage, `/fournil`.
      // Depuis le 2026-10-10, la première vue est partie en Prod manager.
      { path: '', pathMatch: 'full', redirectTo: '/prod-manager' },
      // La fournée est un poste à part depuis le 2026-10-06, comme le
      // colisage : l'ancienne adresse est le favori des postes de labo.
      { path: 'journee', pathMatch: 'full', redirectTo: '/fournil' },
      // Devenu « Prod manager », au premier niveau (2026-10-10) : favori.
      { path: 'previsionnel', pathMatch: 'full', redirectTo: '/prod-manager' },
      {
        // L'arrêt du plan et les jours fermés (arret-du-plan.md, lot A1) :
        // lecture sous `production_settings:read`, la page se fige sans `:write`.
        path: 'reglages',
        canActivate: [permissionGuard('production_settings:read')],
        title: 'Réglages du fournil — LFC B2B admin',
        loadComponent: () =>
          import('./production/production-settings-page/production-settings-page').then(
            (m) => m.ProductionSettingsPage,
          ),
      },
      // Le colisage est un poste à part depuis le 2026-10-04
      // (`documentation/colisage/colisage.md`, P0) : l'ancienne
      // adresse reste valide — c'est le favori des postes de labo.
      { path: 'colisage', pathMatch: 'full', redirectTo: '/colisage' },
    ],
  },
  ...commercialRoutes,
  // 🔴 **VIDE dans un build de production.** `dev-tools.ts` n'y déclare aucune
  // route, donc l'écran de rechargement du jeu de données n'est atteignable
  // depuis aucun point d'entrée — il n'est pas émis dans le bundle. Ce n'est pas
  // une route cachée derrière un drapeau : c'est une route qui n'existe pas.
  ...DEV_TOOLS_ROUTES,
];
