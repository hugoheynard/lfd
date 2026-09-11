import { type Routes } from '@angular/router';

import { permissionGuard } from './auth/permission.guard';
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
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'comptes-clients' },
  // ORDRE ① — avant `ficheClientRoutes` : sans cela « nouveau » serait lu comme
  // un identifiant de société, et la page afficherait « Société introuvable ».
  ...nouveauCompteRoutes,
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
    // Le détail d'une commande vit HORS de la fiche client : une commande « zéro
    // friction » n'a pas d'entreprise, donc pas de fiche où la loger. Une route
    // de premier niveau les couvre toutes les deux.
    path: 'commandes/:id',
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
    canActivate: [permissionGuard('b2b_orders:write')],
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
    // La cible d'un QR de COLISAGE, imprimé sur la fiche d'atelier. Même forme
    // que `retrait/:token` en dessous, et pour la même raison : le segment est
    // encodé dans un code-barres, donc chaque caractère de plus densifie les
    // modules et fragilise le scan.
    //
    // Ce qu'il porte n'est PAS un secret : le numéro de commande est imprimé en
    // clair sur la même feuille. C'est la porte staff qui protège, pas
    // l'ignorance du code — et ça suffit, parce que le colisage est un fait
    // interne, sans seconde partie à représenter.
    path: 'colisage/:reference',
    canActivate: [permissionGuard('b2b_orders:write')],
    title: 'Colisage — LFC B2B admin',
    loadComponent: () =>
      import('./colisage/colisage-page/colisage-page').then((m) => m.ColisagePage),
  },
  {
    // La cible d'un QR de retrait. Route de premier niveau et courte : elle est
    // encodée dans un code-barres, et parfois dictée au téléphone le jour où une
    // caméra refuse de lire. Chaque caractère de plus densifie les modules, donc
    // fragilise le scan — ce n'est pas de la coquetterie d'URL.
    path: 'retrait/:token',
    canActivate: [permissionGuard('b2b_orders:write')],
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
        path: 'flux-des-collections',
        title: 'Flux des collections — LFC B2B admin',
        loadComponent: () =>
          import('./documentation/pim/collections-flow-page/collections-flow-page').then(
            (m) => m.DocCollectionsFlowPage,
          ),
      },
      {
        path: 'segmentation-web',
        title: 'Segmentation web — LFC B2B admin',
        loadComponent: () =>
          import('./documentation/pim/web-segmentation-page/web-segmentation-page').then(
            (m) => m.DocWebSegmentationPage,
          ),
      },
      {
        path: 'integration-shopify',
        title: 'Intégration Shopify — LFC B2B admin',
        loadComponent: () =>
          import('./documentation/pim/shopify-page/shopify-page').then((m) => m.DocShopifyPage),
      },
    ],
  },
  {
    // LIVRAISON — la place réservée, et rien d'autre pour l'instant. L'entrée
    // existe avant le module pour que personne ne range ses premiers écrans
    // dans « Production » en attendant, d'où plus personne ne les sortirait.
    // Même mur que la production : c'est la même commande, vue au bout.
    path: 'livraison',
    canActivate: [permissionGuard('b2b_orders:read')],
    title: 'Livraison — LFC B2B admin',
    loadComponent: () =>
      import('./livraison/livraison-page/livraison-page').then((m) => m.DeliveryPage),
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
    // LA FILE DE REMISE — qui attend au comptoir aujourd'hui. Route de premier
    // niveau, à côté de « production » et « livraison » : c'est le même flux de
    // commandes, vu à un troisième moment.
    //
    // ⚠️ Elle ne remplace PAS `retrait/:token`, et ne peut pas : ce chemin-là
    // est ce que les QR déjà partis en courriel encodent. Celui-ci est la file
    // qu'on ouvre le matin ; l'autre est la cible d'un scan.
    path: 'remises',
    canActivate: [permissionGuard('b2b_orders:read')],
    title: 'Retrait boutique — LFC B2B admin',
    loadComponent: () => import('./remises/remises-page/remises-page').then((m) => m.RemisesPage),
  },
  {
    path: 'production',
    // Les commandes en lecture : c'est la même donnée que la liste staff, vue
    // par le fournil. Le garde est ici parce qu'une URL tapée ou un favori ne
    // passent pas par le rail — et un poste du labo ouvrira exactement ça.
    canActivate: [permissionGuard('b2b_orders:read')],
    title: 'Production — LFC B2B admin',
    loadComponent: () => import('./production/production-page').then((m) => m.ProductionPage),
  },
  ...commercialRoutes,
  // 🔴 **VIDE dans un build de production.** `dev-tools.ts` n'y déclare aucune
  // route, donc l'écran de rechargement du jeu de données n'est atteignable
  // depuis aucun point d'entrée — il n'est pas émis dans le bundle. Ce n'est pas
  // une route cachée derrière un drapeau : c'est une route qui n'existe pas.
  ...DEV_TOOLS_ROUTES,
];
