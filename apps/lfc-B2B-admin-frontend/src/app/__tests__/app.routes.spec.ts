import type { Route } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { routes } from '../app.routes';
import type { PermissionGuard } from '../auth/permission.guard';

/**
 * **Quel droit ouvre quel écran** — la table entière, écrite une fois.
 *
 * Ce n'est pas une paraphrase des routes : c'est la décision, et les tests plus
 * bas vérifient que le routeur s'y conforme. Ajouter un écran sans l'inscrire
 * ici fait échouer la suite — c'est tout l'intérêt, parce qu'un écran non gardé
 * ne se voit pas à la relecture. Il se voit le jour où quelqu'un l'ouvre et
 * récolte des 403 partout, ce qui ressemble à une panne bien plus qu'à un refus.
 *
 * `null` = hérite du garde de son parent, et c'est **correct** parce que
 * l'écran parle de la même ressource. « Admin → Utilisateurs » est
 * précisément le cas où ça ne l'est pas : l'annuaire de l'équipe exige
 * `staff:read`, la seule ressource que le catalogue réserve aux
 * administrateurs, alors que son parent s'ouvre sur `companies:read`. Hériter
 * y ouvrait la page à un commercial, dont chaque appel rendait ensuite 403.
 */
const OPEN = 'open';

/**
 * `null` = hérite d'un ancêtre gardé. `OPEN` = personne ne le garde, et c'est
 * VOULU. Les distinguer est tout l'intérêt : sans ce mot, un écran oublié et un
 * écran ouvert exprès s'écrivent pareil, et le test qui traque les orphelins ne
 * peut plus rien dire.
 */
type ScreenAccess = StaffPermission | null | typeof OPEN;

const SCREENS: Readonly<Record<string, ScreenAccess>> = {
  'commercial/comptes-clients': 'companies:read',
  'comptes-clients/nouveau': 'companies:write',
  'commandes/:id': 'orders:read',
  'comptes-clients/:id/nouvelle-commande': 'orders:write',
  'retrait/:token': 'orders:write',

  'comptes-clients/:id': 'companies:read',
  'comptes-clients/:id/dashboard': null,
  'comptes-clients/:id/informations': null,
  'comptes-clients/:id/commandes': null,
  'comptes-clients/:id/facturation': null,
  'comptes-clients/:id/stats': null,
  'comptes-clients/:id/paniers-recurrents': null,
  'comptes-clients/:id/alertes': null,
  'comptes-clients/:id/data': null,

  // ADMIN — ce qui se règle sur les GENS. Le parent s'ouvre sur le plus faible
  // des deux droits, et chaque vue porte le sien : `null` aurait donné à
  // l'annuaire de l'équipe le mur des sociétés, qui n'est pas le sien.
  admin: 'companies:read',
  'admin/acces-en-attente': 'companies:read',
  'admin/utilisateurs': 'staff:read',
  // Le journal traverse les modules : il a sa propre ressource, et n'hérite
  // donc pas du `companies:read` de son parent.
  'admin/journal': 'activity:read',

  // Son PROPRE périmètre, et pas `settings:read` : regarder la flotte n'est pas
  // la régler. Le jour où l'un s'ouvre à quelqu'un, l'autre n'a aucune raison
  // de suivre — et un écran qui expose la topologie interne mérite sa décision.
  sante: 'ops:read',

  reglages: 'settings:read',
  'reglages/retraits-livraisons': null,
  // Page de DOCUMENTATION : elle explique la tarification, elle ne la règle pas.
  // Même mur que l'onglet qu'elle commente.
  'reglages/facturation': null,
  'reglages/commercial': 'growth:read',

  // L'ESPACE B2B — ce que la plateforme client vend, et à quel prix. Même mur
  // que les réglages d'où ses écrans viennent : décider d'un prix de vente est
  // du paramétrage, pas une ressource à part.
  b2b: 'settings:read',
  'b2b/catalogue': null,
  'b2b/tarification': null,
  // La frise LIT la même chose que la grille, à d'autres dates : même mur.
  'b2b/tarification/frise': null,
  'b2b/tarification/simulateur': null,

  pim: 'catalog:read',
  // La SEULE vue du PIM à ne pas hériter : poser un taux de TVA est une
  // décision comptable, et `catalog:write` est réservé à l'admin. La ressource
  // `tax` existe pour ça — sans retirer de lecture à qui l'avait.
  'pim/tva': 'tax:read',
  'pim/collections': null,
  'pim/publication': null,
  // La famille se règle sur SA page depuis c-0 : même droit que la liste, elle
  // n'ouvre rien de plus — le référentiel garde chaque écriture de son côté.
  'pim/categories/nouveau': null,
  'pim/categories/:id': null,
  'pim/categories': null,
  'pim/emplacements': null,
  // Le registre décide de ce qu'on peut VENDRE, mais ne porte aucun taux :
  // `catalog:read` suffit, et `tax:read` serait un mur pour rien.
  'pim/contextes': null,
  'pim/integration': null,
  'pim/produits/nouveau': null,
  'pim/produits/:id': null,
  'pim/produits': null,
  production: 'orders:read',
  livraison: 'orders:read',
  // Un QR de sa propre origine et un mode d'emploi : rien à garder.
  'app-mobile': OPEN,
  // AUCUN garde, et c'est voulu : de la prose sur le fonctionnement du
  // catalogue, pas une donnée. Elle n'a pas de parent dont hériter — d'où
  // `OPEN` plutôt que `null`.
  documentation: OPEN,

  commercial: 'companies:read',
  'commercial/cockpit': 'growth:read',
  'commercial/prospects': 'growth:read',
  analytics: 'growth:read',
  'commercial/calendrier': 'growth:read',
  // Les deux gabarits héritent du mur de `commercial` (`growth:read`) : ils
  // portent des prix négociés, et la même personne qui voit les prospects
  // négocie leurs tarifs.
  'commercial/tarification/mercuriales-templates': null,
  'commercial/tarification/devis-templates': null,
  'commercial/tarification/mercuriales-templates/:id': null,
  'commercial/tarification/devis-templates/:id': null,

  'rendez-vous/:appointmentId': 'appointments:read',
};

/** Toutes les routes de l'arbre, avec leur chemin complet. */
function flatten(tree: readonly Route[], prefix = ''): { path: string; route: Route }[] {
  return tree.flatMap((route) => {
    const path = [prefix, route.path ?? ''].filter((part) => part !== '').join('/');
    return [{ path, route }, ...flatten(route.children ?? [], path)];
  });
}

/** Les routes qui rendent un écran — une redirection n'en rend aucun. */
function screens(): { path: string; route: Route }[] {
  return flatten(routes).filter(
    ({ route }) => route.loadComponent !== undefined || route.component !== undefined,
  );
}

/**
 * Ce garde porte-t-il sa permission ? Prédicat vérifié plutôt que conversion :
 * `canActivate` accepte aussi les gardes historiques (une classe, voire une
 * chaîne), et `in` seul ne compile pas sur cette union.
 */
function carriesPermission(guard: unknown): guard is PermissionGuard {
  return typeof guard === 'function' && 'permission' in guard;
}

/** La permission déclarée par cette route, ou `null` si elle n'en déclare pas. */
function declaredPermission(route: Route): StaffPermission | null {
  return (route.canActivate ?? []).filter(carriesPermission)[0]?.permission ?? null;
}

describe("l'arbre de routes du back-office", () => {
  it("n'a aucun écran absent de la table", () => {
    const missing = screens()
      .map(({ path }) => path)
      .filter((path) => !(path in SCREENS));

    expect(missing).toEqual([]);
  });

  it('ne garde aucun écran que la table ne connaît plus', () => {
    const live = new Set(screens().map(({ path }) => path));
    const stale = Object.keys(SCREENS).filter((path) => !live.has(path));

    expect(stale).toEqual([]);
  });

  it('ferme chaque écran derrière EXACTEMENT le droit annoncé', () => {
    const wrong = screens()
      .map(({ path, route }) => ({ path, declared: declaredPermission(route) }))
      // Un écran `OPEN` ne déclare rien — c'est exactement ce qu'on attend de lui.
      .filter(({ path, declared }) => declared !== (SCREENS[path] === OPEN ? null : SCREENS[path]));

    expect(wrong).toEqual([]);
  });

  it('garde les anciennes adresses des deux écrans déménagés', () => {
    // Catalogue et Tarification ont quitté les Réglages pour l'espace B2B.
    // Leurs URL vivent dans des favoris et des liens collés : un rangement qui
    // rend 404 se paie par celui qui ne l'a pas fait.
    const reglages = routes.find((route) => route.path === 'reglages');
    const moved = (reglages?.children ?? [])
      .filter((child) => typeof child.redirectTo === 'string')
      .map((child) => [child.path, child.redirectTo]);

    expect(moved).toEqual([
      ['', 'retraits-livraisons'],
      ['catalogue', '/b2b/catalogue'],
      ['tarification', '/b2b/tarification'],
      ['tarification/frise', '/b2b/tarification/frise'],
      ['tarification/simulateur', '/b2b/tarification/simulateur'],
    ]);
  });

  it('ne laisse hériter que les écrans dont le parent est gardé', () => {
    const guarded = new Set(
      screens()
        .filter(({ route }) => declaredPermission(route) !== null)
        .map(({ path }) => path),
    );
    const orphans = Object.entries(SCREENS)
      .filter(([, permission]) => permission === null)
      .map(([path]) => path)
      .filter((path) => !ancestorsOf(path).some((ancestor) => guarded.has(ancestor)));

    expect(orphans).toEqual([]);
  });
});

/** Les chemins parents de celui-ci, du plus proche au plus lointain. */
function ancestorsOf(path: string): string[] {
  const segments = path.split('/');
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
}
