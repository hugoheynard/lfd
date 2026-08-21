import { type Routes } from '@angular/router';

import { permissionGuard } from './auth/permission.guard';
import { adminRoutes } from './admin/admin.routes';
import { commercialRoutes } from './commercial/commercial.routes';
import { ficheClientRoutes, nouveauCompteRoutes } from './fiche-client/fiche-client.routes';
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
    // Le détail d'une commande vit HORS de la fiche client : une commande « zéro
    // friction » n'a pas d'entreprise, donc pas de fiche où la loger. Une route
    // de premier niveau les couvre toutes les deux.
    path: 'commandes/:id',
    canActivate: [permissionGuard('orders:read')],
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
    canActivate: [permissionGuard('orders:write')],
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
    canActivate: [permissionGuard('ops:read')],
    title: 'Santé de l’écosystème — LFC B2B admin',
    loadComponent: () => import('./ops/sante-page/sante-page').then((m) => m.SantePage),
  },
  {
    // La cible d'un QR de retrait. Route de premier niveau et courte : elle est
    // encodée dans un code-barres, et parfois dictée au téléphone le jour où une
    // caméra refuse de lire. Chaque caractère de plus densifie les modules, donc
    // fragilise le scan — ce n'est pas de la coquetterie d'URL.
    path: 'retrait/:token',
    canActivate: [permissionGuard('orders:write')],
    title: 'Retrait — LFC B2B admin',
    loadComponent: () => import('./retrait/retrait-page/retrait-page').then((m) => m.RetraitPage),
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
    canActivate: [permissionGuard('growth:read')],
    title: 'Analytics — LFC B2B admin',
    loadComponent: () =>
      import('./analytics/croissance/croissance-page').then((m) => m.CroissancePage),
  },
  ...pimRoutes,
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
  },
  {
    // LIVRAISON — la place réservée, et rien d'autre pour l'instant. L'entrée
    // existe avant le module pour que personne ne range ses premiers écrans
    // dans « Production » en attendant, d'où plus personne ne les sortirait.
    // Même mur que la production : c'est la même commande, vue au bout.
    path: 'livraison',
    canActivate: [permissionGuard('orders:read')],
    title: 'Livraison — LFC B2B admin',
    loadComponent: () =>
      import('./livraison/livraison-page/livraison-page').then((m) => m.LivraisonPage),
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
    path: 'production',
    // Les commandes en lecture : c'est la même donnée que la liste staff, vue
    // par le fournil. Le garde est ici parce qu'une URL tapée ou un favori ne
    // passent pas par le rail — et un poste du labo ouvrira exactement ça.
    canActivate: [permissionGuard('orders:read')],
    title: 'Production — LFC B2B admin',
    loadComponent: () => import('./production/production-page').then((m) => m.ProductionPage),
  },
  ...commercialRoutes,
];
