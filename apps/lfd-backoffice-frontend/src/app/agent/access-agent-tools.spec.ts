import { HttpErrorResponse } from '@angular/common/http';
import { computed, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  StaffMeView,
  StaffRoleView,
  StaffUserView,
  UpdateStaffRolePayload,
  UpdateStaffUserPayload,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StaffRolesService } from '../admin/roles/staff-roles.service';
import { StaffUsersService } from '../admin/staff-users/staff-users.service';
import { PermissionsStore } from '../auth/permissions.store';

import { declareAccessAgentTools } from './access-agent-tools';

/**
 * Les outils agent des droits (plan `plan-outils-agent-droits.md`) : la
 * lecture des vues servies, l'écriture d'UN élément avec précondition et
 * en-tête, et la garde — chaque refus sans aucun appel d'écriture.
 */

type ToolArgs = Record<string, unknown>;

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: ToolArgs) => Promise<string>;
}

function role(key: string, over: Partial<StaffRoleView> = {}): StaffRoleView {
  return {
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    locked: false,
    grants: [{ resource: 'b2b_orders', action: 'write' }],
    permissions: ['b2b_orders:read', 'b2b_orders:write'],
    memberCount: 1,
    archivedAt: null,
    ...over,
  };
}

const PRICING_ALLOW = { resource: 'b2b_pricing', action: 'write', effect: 'allow' } as const;

function person(id: string, over: Partial<StaffUserView> = {}): StaffUserView {
  return {
    id,
    firstName: 'Cécile',
    lastName: 'Martin',
    email: 'cecile@lfc.test',
    phone: '06 11 22 33 44',
    jobTitle: 'Vendeuse',
    role: 'atelier',
    roleLabel: 'Atelier',
    isRescue: false,
    status: 'active',
    invitedAt: null,
    invitationExpired: false,
    overrides: [PRICING_ALLOW],
    permissions: ['b2b_orders:read', 'b2b_orders:write', 'b2b_pricing:read', 'b2b_pricing:write'],
    updatedAt: '2026-10-01T08:00:00.000Z',
    ...over,
  };
}

/** La personne connectée : rôle `gardien`, qui gère les droits. */
const ME: StaffMeView = {
  id: 'me',
  firstName: 'Hugo',
  lastName: 'H',
  email: 'hugo@lfc.test',
  role: 'gardien',
  roleLabel: 'Gardien',
  permissions: ['staff_access:read', 'staff_access:write'],
  navPrefs: { worksheetCategory: null, productSectionFamily: null },
};

interface Wire {
  roles: StaffRoleView[];
  people: StaffUserView[];
  readonly roleWrites: {
    readonly key: string;
    readonly payload: UpdateStaffRolePayload;
    readonly tool: string | undefined;
  }[];
  readonly personWrites: {
    readonly id: string;
    readonly payload: UpdateStaffUserPayload;
    readonly tool: string | undefined;
  }[];
  refuseWith: HttpErrorResponse | null;
}

function armTools(options: { canWrite?: boolean; me?: StaffMeView | null } = {}) {
  const registered = new Map<string, RegisteredTool>();
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: {
      registerTool: (tool: RegisteredTool): Promise<void> => {
        registered.set(tool.name, tool);
        return Promise.resolve();
      },
    },
  });
  const wire: Wire = {
    roles: [
      role('atelier'),
      role('gardien', { permissions: ['staff_access:read', 'staff_access:write'] }),
      role('admin'),
      role('superadmin', { label: 'Super administrateur', locked: true }),
    ],
    people: [person('p1')],
    roleWrites: [],
    personWrites: [],
    refuseWith: null,
  };
  const roles: Pick<StaffRolesService, 'list' | 'update'> = {
    list: () => Promise.resolve([...wire.roles]),
    update: (key, payload, tool) => {
      if (wire.refuseWith !== null) {
        return Promise.reject(wire.refuseWith);
      }
      wire.roleWrites.push({ key, payload, tool });
      wire.roles = wire.roles.map((entry) =>
        entry.key === key ? { ...entry, grants: payload.grants } : entry,
      );
      return Promise.resolve();
    },
  };
  const staff: Pick<StaffUsersService, 'list' | 'update'> = {
    list: () => Promise.resolve([...wire.people]),
    update: (id, payload, tool) => {
      wire.personWrites.push({ id, payload, tool });
      wire.people = wire.people.map((entry) =>
        entry.id === id ? { ...entry, role: payload.role, roleLabel: 'Support' } : entry,
      );
      return Promise.resolve();
    },
  };
  const me = options.me === undefined ? ME : options.me;
  const permissions: Pick<PermissionsStore, 'identity'> = { identity: computed(() => me) };
  TestBed.configureTestingModule({
    providers: [
      { provide: StaffRolesService, useValue: roles },
      { provide: StaffUsersService, useValue: staff },
      { provide: PermissionsStore, useValue: permissions },
    ],
  });
  const names = runInInjectionContext(TestBed.inject(Injector), () =>
    declareAccessAgentTools(options.canWrite ?? true),
  );
  function run(name: string, args: ToolArgs = {}): Promise<string> {
    const found = registered.get(name);
    if (found === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    return found.execute(args);
  }
  return { names, run, wire, registered };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => Reflect.deleteProperty(document, 'modelContext'));

describe('declareAccessAgentTools — la trousse', () => {
  it('déclare cinq lectures et trois écritures, ni création ni archivage', () => {
    const { names } = armTools();
    expect(names).toEqual([
      'roles_list',
      'role_get',
      'staff_list',
      'staff_access_of',
      'who_can',
      'role_grant',
      'role_revoke',
      'staff_assign_role',
    ]);
    expect(names.some((name) => /create|archive|suspend|invite/u.test(name))).toBe(false);
  });

  it('sans `staff_access:write`, ne déclare QUE la lecture', () => {
    const { names, registered } = armTools({ canWrite: false });
    expect([...registered.keys()]).toEqual([...names]);
    expect(names).not.toContain('role_grant');
  });
});

describe('la lecture — les vues servies, jamais recombinées', () => {
  it('roles_list et role_get disent les droits rangés par catégorie, avec leurs libellés', async () => {
    const { run } = armTools();
    expect(await run('roles_list')).toContain('« Atelier » — clé atelier — ACTIF');
    const text = await run('role_get', { key: 'atelier' });
    expect(text).toContain('Commandes [b2b_orders] (écriture)');
    expect(await run('role_get', { key: 'nope' })).toContain('REFUSÉ : aucun rôle n’a la clé nope');
  });

  it('staff_access_of rend l’effectif SERVI, pas un calcul du navigateur', async () => {
    const { run, wire } = armTools();
    // Une vue où le serveur a refusé les commandes malgré le rôle : seul ce
    // qu'il sert compte — un recalcul rôle + dérogations dirait l'inverse.
    wire.people = [person('p1', { permissions: ['b2b_pricing:read'] })];
    const text = await run('staff_access_of', { staffUserId: 'p1' });
    expect(text).toContain('ACCORDÉ en plus du rôle : Tarification');
    expect(text).toContain('(lecture)');
    expect(text).not.toContain('Commandes [b2b_orders]');
  });

  it('who_can distingue le rôle, la dérogation et le retrait', async () => {
    const { run, wire } = armTools();
    wire.people = [
      person('p1'),
      person('p2', { firstName: 'Paul', role: 'support', roleLabel: 'Support' }),
      person('p3', { firstName: 'Zoé', permissions: [] }),
    ];
    const text = await run('who_can', { permission: 'b2b_orders:write' });
    expect(text).toContain('Rôles qui le donnent : « Atelier » (atelier)');
    expect(text).toMatch(/Cécile Martin — id p1 .* — par son rôle/u);
    expect(text).toMatch(/Paul Martin — id p2 .* — par dérogation/u);
    expect(text).toContain('RETIRÉ par dérogation malgré le rôle : Zoé Martin');
    expect(await run('who_can', { permission: 'nimporte:quoi' })).toContain('REFUSÉ');
  });
});

describe('role_grant / role_revoke — un droit, le rôle entier, une précondition', () => {
  it('renvoie le rôle entier avec son libellé, la précondition lue et l’en-tête', async () => {
    const { run, wire } = armTools();
    const text = await run('role_grant', { key: 'atelier', permission: 'b2b_alerts:read' });

    expect(wire.roleWrites).toEqual([
      {
        key: 'atelier',
        tool: 'role_grant',
        payload: {
          label: 'Atelier',
          grants: [
            { resource: 'b2b_orders', action: 'write' },
            { resource: 'b2b_alerts', action: 'read' },
          ],
          expectedPermissions: ['b2b_orders:read', 'b2b_orders:write'],
        },
      },
    ]);
    expect(text).toContain('MODIFIÉ');
    expect(text).toContain('Effectif partout sous 30 secondes');
  });

  it('retirer l’écriture laisse la lecture ; un droit déjà tenu n’écrit rien', async () => {
    const { run, wire } = armTools();
    await run('role_revoke', { key: 'atelier', permission: 'b2b_orders:write' });
    expect(wire.roleWrites[0]?.payload.grants).toEqual([
      { resource: 'b2b_orders', action: 'read' },
    ]);
    expect(wire.roleWrites[0]?.tool).toBe('role_revoke');

    const nothing = await run('role_grant', { key: 'atelier', permission: 'b2b_orders:read' });
    expect(nothing).toContain('RIEN À FAIRE');
    expect(wire.roleWrites).toHaveLength(1);
  });

  it('rend le refus du serveur (409, précondition périmée) au lieu de jeter', async () => {
    const { run, wire } = armTools();
    wire.refuseWith = new HttpErrorResponse({
      status: 409,
      error: { message: 'Le rôle « Atelier » a changé depuis votre lecture : rien n’a été écrit.' },
    });
    const text = await run('role_grant', { key: 'atelier', permission: 'b2b_alerts:read' });
    expect(text).toContain('REFUSÉ : 409 — Le rôle « Atelier » a changé depuis votre lecture');
  });
});

describe('la garde des rôles — refus avec la raison, avant tout appel', () => {
  const CASES: readonly (readonly [string, ToolArgs, RegExp])[] = [
    [
      'un droit staff_access',
      { key: 'atelier', permission: 'staff_access:read' },
      /ouvre la gestion des droits/u,
    ],
    ['le superadmin', { key: 'superadmin', permission: 'b2b_alerts:read' }, /hors de portée/u],
    ['admin', { key: 'admin', permission: 'b2b_alerts:read' }, /hors de portée/u],
    [
      'un rôle qui gère les droits, sous une autre clé',
      { key: 'gardien', permission: 'b2b_alerts:read' },
      /ouvre la gestion des droits/u,
    ],
  ];

  for (const [label, args, reason] of CASES) {
    it(`refuse ${label}`, async () => {
      const { run, wire } = armTools();
      for (const tool of ['role_grant', 'role_revoke']) {
        const text = await run(tool, args);
        expect(text).toContain('REFUSÉ');
        expect(text).toMatch(reason);
      }
      expect(wire.roleWrites).toEqual([]);
    });
  }

  it('refuse le rôle de la personne connectée', async () => {
    const { run, wire } = armTools({ me: { ...ME, role: 'atelier' } });
    const text = await run('role_grant', { key: 'atelier', permission: 'b2b_alerts:read' });
    expect(text).toMatch(/votre propre rôle/u);
    expect(wire.roleWrites).toEqual([]);
  });
});

describe('staff_assign_role — la fiche entière, rôle seul changé', () => {
  it('garde identité et dérogations, envoie la précondition et l’en-tête', async () => {
    const { run, wire } = armTools();
    wire.roles = [...wire.roles, role('support')];
    const text = await run('staff_assign_role', { staffUserId: 'p1', roleKey: 'support' });

    expect(wire.personWrites).toEqual([
      {
        id: 'p1',
        tool: 'staff_assign_role',
        payload: {
          firstName: 'Cécile',
          lastName: 'Martin',
          email: 'cecile@lfc.test',
          phone: '06 11 22 33 44',
          jobTitle: 'Vendeuse',
          role: 'support',
          // Régression évitée (vitruve, BLOQUANT) : sans elles, le serveur
          // effacerait toutes les dérogations de la personne.
          overrides: [PRICING_ALLOW],
          expectedUpdatedAt: '2026-10-01T08:00:00.000Z',
        },
      },
    ]);
    expect(text).toContain('rôle « Atelier » → « Support »');
    expect(text).toContain('Effectif partout sous 30 secondes');
  });

  const REFUSED: readonly (readonly [string, Partial<StaffUserView>, string, RegExp])[] = [
    ['la fiche de secours', { isRescue: true }, 'support', /fiche de secours/u],
    [
      'une personne qui gère les droits par dérogation',
      { permissions: ['staff_access:read'] },
      'support',
      /gère les droits/u,
    ],
    [
      'une personne qui tient admin',
      { role: 'admin', roleLabel: 'Administrateur' },
      'support',
      /hors de portée/u,
    ],
    ['soi-même', { id: 'me' }, 'support', /c’est vous/u],
    ['le rôle cible admin', {}, 'admin', /hors de portée/u],
    ['le rôle cible superadmin', {}, 'superadmin', /hors de portée/u],
    ['un rôle cible qui gère les droits', {}, 'gardien', /ouvre la gestion des droits/u],
    ['un rôle cible archivé', {}, 'ancien', /archivé/u],
  ];

  for (const [label, over, roleKey, reason] of REFUSED) {
    it(`refuse ${label}`, async () => {
      const { run, wire } = armTools();
      const target = person('p1', over);
      wire.people = [target];
      wire.roles = [
        ...wire.roles,
        role('support'),
        role('ancien', { archivedAt: '2026-09-01T00:00:00.000Z' }),
      ];
      const text = await run('staff_assign_role', { staffUserId: target.id, roleKey });
      expect(text).toContain('REFUSÉ');
      expect(text).toMatch(reason);
      expect(wire.personWrites).toEqual([]);
    });
  }
});
