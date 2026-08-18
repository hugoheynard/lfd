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
 * l'écran parle de la même ressource. « Réglages → Utilisateurs » est
 * précisément le cas où ça ne l'était pas : rangé sous Réglages, il exige
 * `staff:read`, la seule ressource que le catalogue réserve aux
 * administrateurs. Il héritait de `settings:read`, donc un commercial ouvrait
 * la page et chaque appel rendait 403.
 */
const SCREENS: Readonly<Record<string, StaffPermission | null>> = {
  'comptes-clients': 'companies:read',
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

  'acces-en-attente': 'companies:read',

  reglages: 'settings:read',
  'reglages/retraits-livraisons': null,
  // `null` = hérite du `settings:read` du parent : le paramétrage du catalogue
  // est du réglage, pas une ressource à part.
  'reglages/catalogue': null,
  // Même raison : décider d'un prix est du réglage.
  'reglages/tarification': null,
  // La frise LIT la même chose que la grille, à d'autres dates : même mur.
  'reglages/tarification/frise': null,
  'reglages/tarification/simulateur': null,
  // Page de DOCUMENTATION : elle explique la tarification, elle ne la règle pas.
  // Même mur que l'onglet qu'elle commente.
  'reglages/facturation': null,
  'reglages/commercial': 'growth:read',
  'reglages/utilisateurs': 'staff:read',

  production: 'orders:read',

  commercial: 'growth:read',
  'commercial/cockpit': null,
  'commercial/prospects': null,
  'commercial/croissance': null,
  'commercial/calendrier': null,
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
      .filter(({ path, declared }) => declared !== SCREENS[path]);

    expect(wrong).toEqual([]);
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
