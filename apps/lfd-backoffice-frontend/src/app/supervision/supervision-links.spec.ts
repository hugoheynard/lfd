import type { Route } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { StaffPermission } from '@lfd/contracts';

import { routes } from '../app.routes';
import type { PermissionGuard } from '../auth/permission.guard';
import { landingColumnOf, LINK_PERMISSION, SUPERVISION_LINKS } from './supervision-links';

function carriesPermission(guard: unknown): guard is PermissionGuard {
  return typeof guard === 'function' && 'permission' in guard;
}

function declared(route: Route): readonly StaffPermission[] {
  return (route.canActivate ?? []).filter(carriesPermission).map((guard) => guard.permission);
}

/**
 * La garde EFFECTIVE d'un chemin : celle de la route la plus proche qui en
 * déclare une, en remontant de l'enfant vers la coquille — ce qu'Angular
 * applique vraiment à qui suit le lien.
 */
function effectiveGuard(path: string): readonly StaffPermission[] | undefined {
  const segments = path.replace(/^\//u, '').split('/');
  let level: readonly Route[] = routes;
  let found: readonly StaffPermission[] = [];
  for (const segment of segments) {
    const route = level.find((candidate) => candidate.path === segment);
    if (route === undefined) {
      return undefined;
    }
    const own = declared(route);
    if (own.length > 0) {
      found = own;
    }
    level = route.children ?? [];
  }
  return found;
}

describe('les renvois de la Supervision', () => {
  it.each(Object.entries(SUPERVISION_LINKS))(
    'le renvoi %s mène à une route gardée par le droit qui l’affiche',
    (_, link) => {
      expect(effectiveGuard(link.path)).toEqual([LINK_PERMISSION]);
    },
  );

  it('ne vise que des listes, jamais un bac ouvert en écriture', () => {
    for (const link of Object.values(SUPERVISION_LINKS)) {
      expect(link.path).not.toContain(':');
    }
  });

  it('dit ce qu’on va faire, jamais le geste', () => {
    for (const link of Object.values(SUPERVISION_LINKS)) {
      expect(link.label).toMatch(/^Ouvrir /u);
    }
  });
});

describe('l’onglet d’arrivée en mobile', () => {
  it('suit le rôle : le comptoir arrive sur le retrait, les autres sur la préparation', () => {
    expect(landingColumnOf('comptoir')).toBe('handover');
    expect(landingColumnOf('admin')).toBe('preparation');
    expect(landingColumnOf(null)).toBe('preparation');
  });
});
