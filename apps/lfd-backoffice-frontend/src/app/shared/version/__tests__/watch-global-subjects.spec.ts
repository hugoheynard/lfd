import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { watchGlobalSubjects } from '../watch-global-subjects';
import { type VersionWatch, VersionWatcher } from '../version-watcher';

/** Les droits du poste, posés par le test. */
class FixedPermissions {
  granted: readonly StaffPermission[] = [];
  can(permission: StaffPermission): boolean {
    return this.granted.includes(permission);
  }
}

/** Le veilleur, réduit à ce qu'on lui confie. */
class RecordingWatcher {
  spec: VersionWatch | null = null;
  watch(spec: VersionWatch): void {
    this.spec = spec;
  }
}

describe('watchGlobalSubjects — un sujet par ses droits', () => {
  let permissions: FixedPermissions;
  let watcher: RecordingWatcher;

  beforeEach(() => {
    permissions = new FixedPermissions();
    watcher = new RecordingWatcher();
    TestBed.configureTestingModule({
      providers: [
        { provide: PermissionsStore, useValue: permissions },
        { provide: VersionWatcher, useValue: watcher },
      ],
    });
    TestBed.runInInjectionContext(() =>
      watchGlobalSubjects(['pim', 'catalog-admin'], async () => undefined),
    );
  });

  function followed(): readonly string[] {
    const subjects = watcher.spec?.subjects;
    return typeof subjects === 'function' ? subjects() : (subjects ?? []);
  }

  it.each([
    'pim_catalog:read',
    'pim_tax:read',
    'pim_settings:read',
    'allergen_matrix:read',
  ] as const)('`pim` est suivi sous %s seul', (permission) => {
    permissions.granted = [permission];

    expect(followed()).toEqual(['pim']);
  });

  it('`pim` n’est pas suivi sans aucun des quatre droits', () => {
    permissions.granted = ['lfc_catalog:read'];

    expect(followed()).toEqual(['catalog-admin']);
  });
});
