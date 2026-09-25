import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  ALL_STAFF_PERMISSIONS,
  type StaffPermission,
  type StaffRoleView,
  type StaffUserView,
} from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { StaffRolesService } from '../../roles/staff-roles.service';
import { StaffUsersService } from '../staff-users.service';
import { StaffUserPanel } from './staff-user-panel';

const USER: StaffUserView = {
  id: 'stf_1',
  firstName: 'Cécile',
  lastName: 'Martin',
  email: 'cecile@example.test',
  phone: '',
  jobTitle: '',
  role: 'commercial',
  roleLabel: 'Commercial',
  isRescue: false,
  overrides: [],
  status: 'active',
  invitedAt: null,
  invitationExpired: false,
  permissions: [],
};

/** Une définition telle que `GET /admin/staff-roles` la rend. */
function definition(key: string, label: string, over: Partial<StaffRoleView> = {}): StaffRoleView {
  return {
    key,
    label,
    locked: false,
    grants: [{ resource: 'b2b_orders', action: 'read' }],
    permissions: ['b2b_orders:read'],
    memberCount: 0,
    archivedAt: null,
    ...over,
  };
}

/** Les rôles en base : le sommet, deux actifs dont un créé à l'écran, un archivé. */
const DEFINITIONS: readonly StaffRoleView[] = [
  definition('superadmin', 'Super administrateur', {
    locked: true,
    grants: [],
    permissions: ALL_STAFF_PERMISSIONS,
  }),
  definition('commercial', 'Commercial'),
  definition('vendeur-marche', 'Vendeur du marché', {
    grants: [{ resource: 'b2b_counter', action: 'read' }],
  }),
  definition('ancien', 'Ancien rôle', { archivedAt: '2026-01-01T00:00:00.000Z' }),
];

interface Booted {
  readonly fixture: ComponentFixture<StaffUserPanel>;
  readonly closes: unknown[];
}

async function boot(
  user: StaffUserView | null,
  permissions: readonly StaffPermission[],
): Promise<Booted> {
  const closes: unknown[] = [];
  const store: Pick<PermissionsStore, 'can' | 'ensureLoaded'> = {
    can: (permission) => permissions.includes(permission),
    ensureLoaded: () => Promise.resolve(),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [StaffUserPanel],
    providers: [
      // La cible du lien existe : le clic navigue pour de bon.
      provideRouter([{ path: 'admin/journal', children: [] }]),
      { provide: PermissionsStore, useValue: store },
      { provide: StaffUsersService, useValue: {} },
      {
        provide: StaffRolesService,
        useValue: { list: (): Promise<readonly StaffRoleView[]> => Promise.resolve(DEFINITIONS) },
      },
      { provide: NotifyService, useValue: {} },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(StaffUserPanel);
  fixture.componentRef.setInput('data', { user });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, closes };
}

function activityLink(fixture: ComponentFixture<StaffUserPanel>): HTMLAnchorElement | null {
  const host = fixture.nativeElement as HTMLElement;
  return (
    [...host.querySelectorAll<HTMLAnchorElement>('a')].find((a) =>
      (a.textContent ?? '').includes('Voir son activité'),
    ) ?? null
  );
}

/**
 * **« Voir son activité »** (plan journalisation, lot 3) : la fiche d'un membre
 * mène au journal filtré sur lui — mais seulement pour qui peut le lire. Une
 * dérogation `staff_access` sans `activity` mènerait sinon droit à un `403`.
 */
describe('StaffUserPanel — le lien vers le journal', () => {
  it('mène au journal filtré sur l’identifiant de la fiche', async () => {
    const { fixture } = await boot(USER, ['staff_access:write', 'activity:read']);

    const href = activityLink(fixture)?.getAttribute('href') ?? '';

    expect(href).toBe('/admin/journal?actorId=stf_1');
  });

  it('n’apparaît pas sans `activity:read`, même avec l’accès à l’équipe', async () => {
    const { fixture } = await boot(USER, ['staff_access:write', 'staff_access:read']);

    expect(activityLink(fixture)).toBeNull();
  });

  it('n’apparaît pas à la création : il n’y a encore rien à lire', async () => {
    const { fixture } = await boot(null, ['staff_access:write', 'activity:read']);

    expect(activityLink(fixture)).toBeNull();
  });

  it('navigue et ferme le panneau, sans résultat : la liste n’a rien à relire', async () => {
    const { fixture, closes } = await boot(USER, ['staff_access:write', 'activity:read']);

    activityLink(fixture)?.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/admin/journal?actorId=stf_1');
    expect(closes).toEqual([undefined]);
  });
});

/**
 * Plan `plan-roles-lus-en-base.md` §3.5 : la fiche propose les définitions
 * ACTIVES de la table — un rôle créé à l'écran compris —, jamais le sommet.
 */
describe('StaffUserPanel — le sélecteur de rôle lit les définitions', () => {
  function roleOptions(fixture: ComponentFixture<StaffUserPanel>): string[] {
    const host = fixture.nativeElement as HTMLElement;
    return [...host.querySelectorAll<HTMLOptionElement>('option')]
      .map((option) => option.value)
      .filter((value) => !['inherit', 'allow', 'deny'].includes(value));
  }

  it('propose les rôles actifs, sans le sommet ni les archivés', async () => {
    const { fixture } = await boot(null, ['staff_access:write']);

    expect(roleOptions(fixture)).toEqual(['commercial', 'vendeur-marche']);
  });

  it('garde en tête le rôle porté même s’il n’est plus actif', async () => {
    const { fixture } = await boot({ ...USER, role: 'ancien', roleLabel: 'Ancien rôle' }, [
      'staff_access:write',
    ]);

    expect(roleOptions(fixture)).toEqual(['ancien', 'commercial', 'vendeur-marche']);
  });
});

/** La fiche de secours : tous les droits, rien d'éditable côté rôle. */
describe('StaffUserPanel — la fiche de secours', () => {
  const RESCUE: StaffUserView = {
    ...USER,
    role: 'superadmin',
    roleLabel: 'Super administrateur',
    isRescue: true,
  };

  it('fige le sélecteur sur « Super administrateur · porte de secours », avec sa raison', async () => {
    const { fixture } = await boot(RESCUE, ['staff_access:write']);
    const host = fixture.nativeElement as HTMLElement;

    const select = host.querySelector<HTMLSelectElement>('fold-select select');
    expect(select?.disabled).toBe(true);
    expect([...(select?.options ?? [])].map((option) => option.textContent?.trim())).toEqual([
      'Super administrateur · porte de secours',
    ]);
    expect(host.textContent).toContain(
      "Cette fiche a tous les droits, quel que soit son rôle — c'est l'adresse de secours",
    );
  });

  it('ne montre pas la grille des écarts', async () => {
    const { fixture } = await boot(RESCUE, ['staff_access:write']);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-overrides-grid')).toBeNull();
  });

  it('montre la grille pour une fiche ordinaire', async () => {
    const { fixture } = await boot(USER, ['staff_access:write']);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-overrides-grid')).not.toBeNull();
  });
});
