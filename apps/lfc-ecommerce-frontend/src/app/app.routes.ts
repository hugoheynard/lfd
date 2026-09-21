import { type Route, type Routes } from '@angular/router';

import { authenticatedGuard } from './auth/authenticated.guard';
import { DEV_BYPASS_AUTH } from './auth/dev-flags';
import { featureAccessGuard } from './client/feature-access/feature-access.guard';
import { companyWorkspaceGuard, workspaceHomeGuard } from './client/client-workspace.guard';
import { ClientShell } from './client/shell/client-shell';
import { FEATURE_DASHBOARD, FEATURE_PRO_SPACE } from './feature-flags';

/**
 * Accueil `/` : le tableau de bord quand son feature flag est actif, sinon une
 * simple redirection vers Boutique (le dashboard reste alors inaccessible en
 * direct — masqué, pas seulement retiré du menu).
 */
const homeRoute: Route = FEATURE_DASHBOARD
  ? {
      path: '',
      pathMatch: 'full',
      title: 'Tableau de bord — La Folie Coffee B2B',
      canActivate: [authenticatedGuard],
      loadComponent: () => import('./legacy/dashboard/dashboard-page').then((m) => m.DashboardPage),
    }
  : { path: '', pathMatch: 'full', redirectTo: 'boutique' };

/**
 * L'espace PRO hérité, derrière son drapeau.
 *
 * Les composants restent dans le dépôt et continuent de compiler ; ce sont leurs
 * ADRESSES qui disparaissent. Une route absente n'est pas une route protégée :
 * ce qui garde les données, c'est le garde d'authentification et le mur de la
 * société côté API — ici on ne fait que borner la navigation le temps de montrer
 * l'app cliente.
 */
const proRoutes: Routes = FEATURE_PRO_SPACE
  ? [
      // 🔴 `boutique`, `panier`, `mes-paniers` et `mes-paniers/:id` sont parties
      // avec le panier hérité, le 2026-09-06. L'app cliente porte sa boutique et
      // son panier ; garder les deux, c'était garder deux vérités sur le même
      // client. Ce qui reste ici — commandes, entreprises, réglages — ne dépend
      // pas du panier et n'a pas encore d'équivalent client.
      //
      // ⚠️ **« Mes paniers » n'existe nulle part ailleurs.** Le panier
      // enregistré, nommé, réutilisable, est la seule fonctionnalité que cette
      // suppression retire du produit — cf. le commit.
      homeRoute,
      // 🔴 `commandes` est partie le 2026-09-07 avec ses données de
      // DÉMONSTRATION. Elle listait des commandes fabriquées par
      // `buildDemoOrders`, des relevés mensuels dont le règlement ne changeait
      // qu'une couleur, et des changements de régime inventés — sous un en-tête
      // La Folie Coffee. La liste réelle est `/mes-commandes`, servie par
      // l'API. Le DÉTAIL et le RÈGLEMENT ci-dessous restent : eux lisent le
      // serveur.
      {
        // AVANT `commandes/:id` : sans cela le segment `regler` serait lu comme la
        // suite d'un identifiant, et le lien de règlement ouvrirait le détail.
        path: 'commandes/:id/regler',
        title: 'Régler ma commande — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/commandes/reglement-page/reglement-page').then((m) => m.ReglementPage),
      },
      {
        path: 'commandes/:id',
        title: 'Commande — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/commandes/commande-page/commande-page').then((m) => m.CommandePage),
      },
      {
        path: 'entreprises',
        title: 'Mes entreprises — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () =>
          import('./legacy/entreprises/entreprises-page/entreprises-page').then(
            (m) => m.EntreprisesPage,
          ),
      },
      {
        // « Mon profil » a été scindée : la personne est passée dans Réglages, les
        // sociétés dans « Mes entreprises ». La redirection garde les liens et
        // signets existants valides.
        path: 'profil',
        redirectTo: 'entreprises',
        pathMatch: 'full',
      },
      {
        path: 'reglages',
        title: 'Réglages — La Folie Coffee B2B',
        canActivate: [authenticatedGuard],
        loadComponent: () => import('./legacy/reglages/reglages-page').then((m) => m.ReglagesPage),
      },
    ]
  : [];

export const routes: Routes = [
  {
    // Seule route publique : la connexion. Toutes les autres passent le guard.
    path: 'login',
    title: 'Connexion — La Folie Coffee B2B',
    loadComponent: () => import('./login/login-page').then((m) => m.LoginPage),
  },
  // L'ÉCRAN D'AUTH0 SIMULÉ, en dev seulement. `DEV_BYPASS_AUTH` vaut `false` au
  // build de production : la condition se plie, et la route comme son chunk
  // disparaissent du bundle. Hors du shell, comme le vrai écran d'Auth0.
  ...(DEV_BYPASS_AUTH
    ? [
        {
          path: 'dev/inscription-auth0',
          title: 'Auth0 (simulé) — La Folie Coffee',
          loadComponent: () =>
            import('./auth/dev-auth0-signup-page/dev-auth0-signup-page').then(
              (m) => m.DevAuth0SignupPage,
            ),
        },
      ]
    : []),
  {
    // Refonte de l'app CLIENT (handoff design). Route PARENTE : le shell client
    // (barre de marque bleue, pas de rail) enveloppe ses écrans, exactement
    // comme le shell pro enveloppe les siens. Si aucun enfant ne correspond, le
    // routeur revient en arrière et essaie les routes pro qui suivent.
    path: '',
    component: ClientShell,
    // ⚠️ Chaque enfant dit ce que la BOUTIQUE doit permettre pour s'ouvrir
    // (plan `plan-inscription-pro-seule.md` §4). Sans garde : joignable à tous
    // les niveaux — l'entrée, le dossier, et les commandes EXISTANTES (suivi,
    // QR, règlement, confirmation), que le serveur ne ferme pas non plus. Les
    // anciennes adresses en fin de liste n'ont pas de garde à elles : une
    // redirection passe par la garde de sa cible.
    children: [
      {
        // LA RACINE : qui arrive sur le site tombe ici. Une redirection plutôt
        // qu'un doublon de route — l'écran garde une adresse à lui, qu'on peut
        // partager, et `/` ne devient pas un second nom pour la même chose.
        path: '',
        pathMatch: 'full',
        redirectTo: 'bienvenue',
      },
      {
        // 🔴 BIENVENUE A CHANGÉ DE SENS le 2026-09-16 (Hugo). L'adresse portait
        // l'INSCRIPTION — trois champs, une connexion, un rappel commercial ;
        // elle porte désormais l'ACCUEIL PUBLIC, ce que voit un visiteur qui
        // arrive sans compte.
        //
        // Le mot dit enfin ce qu'il désigne : on n'accueille pas quelqu'un en
        // lui tendant un formulaire. L'inscription, elle, a pris le nom de ce
        // qu'elle fait — `/inscription`, juste dessous.
        //
        // ⚠️ Ce qui se paie : un lien déjà distribué vers `/bienvenue` ouvre
        // maintenant autre chose. C'est assumé, et c'est la raison pour
        // laquelle `/inscription` est une route À PART et non une redirection
        // depuis ici — sans quoi les deux sens du mot coexisteraient sans que
        // rien ne les départage.
        path: 'bienvenue',
        title: 'La Folie Coffee — commander, retirer, déguster',
        loadComponent: () =>
          import('./client/accueil-public/accueil-public').then((m) => m.AccueilPublic),
      },
      {
        // L'INSCRIPTION : trois champs, connexion par lien e-mail, rappel
        // commercial. Elle vivait sur `/bienvenue` et n'a pas changé d'un
        // caractère — seule son adresse dit maintenant ce qu'elle fait.
        // Maquette : rien ne part sur le réseau, et `/login` (Auth0) reste la
        // porte réelle en attendant.
        path: 'inscription',
        title: 'Inscription — La Folie Coffee',
        loadComponent: () => import('./login/accueil-page/accueil-page').then((m) => m.AccueilPage),
      },
      {
        // LA PORTE PRO : le lien que donne la commerciale (plan
        // `plan-inscription-pro-seule.md` §3). Sans garde : on ouvre son compte
        // à tous les niveaux de la boutique, c'est même tout l'intérêt quand
        // elle est fermée.
        //
        // 🔴 CE N'EST PLUS UN ÉCRAN À ELLE depuis le 2026-09-21 (handoff
        // `handoff-inscription`, §1) : l'inscription porte les DEUX portes sur
        // une page, et cette adresse ouvre la même, du côté pro. L'adresse
        // reste — la commerciale l'a distribuée — mais elle ne mène plus à un
        // second formulaire qui aurait à rester d'accord avec le premier.
        //
        // ⚠️ Pas une redirection : une redirection vers `/inscription` perdrait
        // justement ce que cette adresse dit, à savoir QUELLE porte ouvrir. Le
        // `data` le dit sans qu'aucun paramètre d'URL ait à le porter.
        path: 'ouverture-compte-pro',
        title: 'Ouverture de compte pro — La Folie Coffee',
        data: { door: 'pro' },
        loadComponent: () => import('./login/accueil-page/accueil-page').then((m) => m.AccueilPage),
      },
      {
        // LE SUIVI, PUIS LA MÉMOIRE. Deux registres et l'ordre n'est pas
        // négociable : ce qui est en route d'abord, ce qui est passé ensuite.
        path: 'mes-commandes',
        // Masquable en admin : seule la LISTE se ferme. Suivi, règlement et
        // retrait gardent leurs adresses à eux, sans cette garde.
        canActivate: [featureAccessGuard('orders', 'visible')],
        title: 'Mes commandes — La Folie Coffee',
        loadComponent: () =>
          import('./client/mes-commandes/commandes-page/commandes-page').then(
            (m) => m.CommandesPage,
          ),
      },
      {
        // LE RELEVÉ, et l'écran le dit. La plateforme n'émet aucune facture :
        // elle rassemble les commandes telles qu'elles partent en comptabilité,
        // et le comptable dépose le PDF après la clôture.
        path: 'mes-factures',
        canActivate: [featureAccessGuard('invoices', 'visible'), companyWorkspaceGuard],
        title: 'Mes factures — La Folie Coffee',
        loadComponent: () =>
          import('./client/mes-factures/factures-page/factures-page').then((m) => m.FacturesPage),
      },
      {
        // LE DOSSIER, écrit pour celui qui le possède. Sept cartes et pas sept
        // écrans : le back-office a des onglets parce qu'un commercial y passe
        // la journée ; un client y passe deux fois par an.
        path: 'mon-compte',
        // En perso, pour qui a une société : fermé (cf. la garde).
        canActivate: [companyWorkspaceGuard],
        title: 'Mon compte — La Folie Coffee',
        loadComponent: () =>
          import('./client/mon-compte/compte-page/compte-page').then((m) => m.ComptePage),
      },
      {
        // Le client reconnu : « On vous sert comment ? ». C'est la PREMIÈRE
        // question du parcours, avant le catalogue — ce qui est en stock, à
        // quelle heure et à quel prix dépend du mode de service.
        path: 'nouvelle-commande',
        canActivate: [featureAccessGuard('shop', 'order')],
        title: 'Commander — La Folie Coffee',
        loadComponent: () =>
          import('./client/nouvelle-commande/commande-page/commande-page').then(
            (m) => m.CommandePage,
          ),
      },
      {
        // LA BOUTIQUE CLIENTE et ses rayons.
        //
        // 🔴 À LA RACINE depuis le 2026-09-21 (Hugo : « pourquoi passer par
        // commande ? »). Elle a vécu sous `nouvelle-commande/`, puis sous
        // `commande/`, au motif qu'elle est « la SUITE d'une commande en
        // cours ». Elle ne l'est pas : le rayon se VISITE sans avoir rien
        // choisi — c'est ce que promet « je visite la boutique », et c'est la
        // raison pour laquelle son garde est `browse` et non `order`. Le
        // préfixe affirmait donc le contraire de ce que l'écran permet.
        //
        // ⚠️ Le reste du tunnel garde `commande/` : le panier, le règlement et
        // la confirmation sont, eux, une commande en cours. La boutique était
        // la seule des quatre à ne pas l'être.
        //
        // 🔴 LA RAISON ÉCRITE ICI ÉTAIT FAUSSE. Elle disait « `/boutique` est
        // prise par la boutique PRO » — or cette route est partie avec le
        // panier hérité le 2026-09-06, ce que le commentaire de `proRoutes`
        // dit lui-même vingt lignes plus haut. Vérifié le 2026-09-21 : aucun
        // `path: 'boutique'` dans ce fichier. Une justification qui parle
        // d'ailleurs survit à ce qui la rendait vraie, et fait garder un
        // détour pour une raison qui n'existe plus.
        path: 'boutique',
        canActivate: [featureAccessGuard('shop', 'browse')],
        title: 'Boutique — La Folie Coffee',
        loadComponent: () => import('./client/shop/shop-page/shop-page').then((m) => m.ShopPage),
      },
      {
        path: 'commande/panier',
        canActivate: [featureAccessGuard('shop', 'order')],
        title: 'Mon panier — La Folie Coffee',
        loadComponent: () =>
          import('./client/cart/panier-page/panier-page').then((m) => m.PanierPage),
      },
      {
        // LE RÈGLEMENT, et il porte l'identifiant de la commande. Elle EXISTE
        // déjà quand on arrive ici : l'adresse doit donc survivre à un
        // rechargement, et se rouvrir plus tard sur une commande restée à payer.
        // Un panneau dans le panier n'aurait tenu ni l'un ni l'autre.
        path: 'commande/reglement/:id',
        title: 'Régler ma commande — La Folie Coffee',
        loadComponent: () =>
          import('./client/nouvelle-commande/reglement-page/reglement-page').then(
            (m) => m.ReglementPage,
          ),
      },
      {
        // LE QR DE RETRAIT, par son identifiant de commande. Il vit sous
        // `mes-commandes/` et pas sous `commande/` : on le rouvre le
        // lendemain matin, depuis l'historique ou un signet, longtemps après
        // que la commande a cessé d'être « nouvelle ».
        path: 'mes-commandes/retrait/:id',
        title: 'Mon QR de retrait — La Folie Coffee',
        loadComponent: () =>
          import('./client/mes-commandes/retrait-page/retrait-page').then((m) => m.RetraitPage),
      },
      {
        path: 'commande/confirmee',
        title: 'Commande confirmée — La Folie Coffee',
        loadComponent: () =>
          import('./client/nouvelle-commande/confirmation-page/confirmation-page').then(
            (m) => m.ConfirmationPage,
          ),
      },
      {
        // L'ENTRÉE : la cible de la connexion. Elle n'a pas d'écran — la garde
        // redirige toujours vers l'accueil de l'espace (`/bienvenue` en perso,
        // `/nouvelle-commande` dans une société), qu'on ne connaît qu'au retour
        // d'Auth0.
        path: 'accueil',
        canActivate: [workspaceHomeGuard],
        loadComponent: () =>
          import('./client/workspace-reload/workspace-reload').then((m) => m.WorkspaceReload),
      },
      {
        // Le détour de la bascule d'espace : un écran vide, traversé sans
        // toucher à l'adresse, pour que la page de destination se remonte à
        // neuf (cf. `ClientWorkspaceSwitch`). Aucun menu n'y mène.
        path: 'changement-d-espace',
        loadComponent: () =>
          import('./client/workspace-reload/workspace-reload').then((m) => m.WorkspaceReload),
      },
      // `/connexion` mène là où l'on se connecte — donc à l'INSCRIPTION depuis
      // le 2026-09-16, et non plus à `/bienvenue`, qui porte maintenant
      // l'accueil public. Y envoyer qui clique « se connecter » l'aurait déposé
      // devant un bandeau de retrait.
      { path: 'connexion', pathMatch: 'full', redirectTo: 'inscription' },
      // 🔴 `/mon-espace` A ÉTÉ RETIRÉE le 2026-09-21 (Hugo : « bienvenue
      // centralise tout »). Son écran répondait « qu'est-ce qui m'attend
      // aujourd'hui ? », ce que `/bienvenue` fait désormais pour les trois
      // états. Son puits « Prêt pour vous » n'a plus d'objet : une commande en
      // suivi y RESTE tant qu'elle n'est pas retirée, et c'est le suivi qui
      // répond.
      //
      // ⚠️ L'adresse, elle, reste servie — elle a été le point d'arrivée de la
      // connexion en perso, et des signets la portent.
      { path: 'mon-espace', pathMatch: 'full', redirectTo: 'bienvenue' },
      // 🔴 LES ANCIENNES ADRESSES RESTENT VALIDES, et le sens des redirections
      // s'est INVERSÉ le 2026-09-20 : `commande/*` était la vieille adresse et
      // renvoyait vers `nouvelle-commande/*` ; c'est maintenant l'inverse. Un
      // lien partagé, un signet, un e-mail de confirmation parti la semaine
      // dernière — tous pointent encore sur `nouvelle-commande/*`, et doivent
      // continuer d'ouvrir le même écran.
      //
      // ⚠️ Elles ne se retirent pas avec l'écran : une adresse servie une fois
      // est servie pour toujours. C'est la même règle que le §0 du CLAUDE.md
      // pour un champ de contrat.
      { path: 'nouvelle-commande/boutique', redirectTo: 'boutique' },
      { path: 'commande/boutique', redirectTo: 'boutique' },
      { path: 'nouvelle-commande/panier', redirectTo: 'commande/panier' },
      { path: 'nouvelle-commande/reglement/:id', redirectTo: 'commande/reglement/:id' },
      { path: 'nouvelle-commande/confirmee', redirectTo: 'commande/confirmee' },
    ],
  },
  ...proRoutes,
  { path: '**', redirectTo: '' },
];
