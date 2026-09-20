import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { StaffPermission, StaffUserView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
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
  overrides: [],
  status: 'active',
  invitedAt: null,
  invitationExpired: false,
  permissions: [],
};

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
