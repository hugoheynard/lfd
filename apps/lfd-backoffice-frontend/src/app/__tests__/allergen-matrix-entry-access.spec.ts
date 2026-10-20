import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { FoldNavLauncherComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { App } from '../app';
import { PermissionsStore } from '../auth/permissions.store';
import { StaffAuth } from '../auth/staff-auth';
import { NavCountsService } from '../nav-counts.service';
import { PushNotificationsService } from '../shared/push/push-notifications.service';

/**
 * **L'entrée « Matrice des allergènes »** (Hugo, 2026-10-20 ; plan
 * `pim/plan-matrice-des-allergenes.md`, AM3) : à part, juste sous le
 * Catalogue, au rail ET aux tuiles, ouverte par le SEUL droit
 * `allergen_matrix:read` — `pim_catalog` n'y mène pas.
 */
@Component({ template: '' })
class Blank {}

const LINK = '/matrice-allergenes';

function configureApp(granted: readonly StaffPermission[]): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([
        { path: 'matrice-allergenes', component: Blank },
        { path: 'pim', component: Blank },
      ]),
      {
        provide: StaffAuth,
        useValue: {
          isLoading: signal(false),
          isAuthenticated: signal(true),
          email: signal('staff@lfc.test'),
          ownsSession: false,
          logout: () => undefined,
        },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          loaded: signal(true),
          permissions: signal(granted),
          identity: signal(null),
          ensureLoaded: async () => undefined,
        },
      },
      {
        provide: NavCountsService,
        useValue: {
          companyWarnings: signal(0),
          accessPending: signal(0),
          refresh: async () => undefined,
        },
      },
      { provide: PushNotificationsService, useValue: { reconcile: async () => undefined } },
    ],
  });
}

function railLabels(granted: readonly StaffPermission[]): (string | null)[] {
  configureApp(granted);
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return [...root.querySelectorAll('a[fold-menu-item]')].map((entry) =>
    entry.getAttribute('label'),
  );
}

/** Les tuiles du lanceur mobile, launcher ouvert sur un écran étroit. */
async function tileLabels(granted: readonly StaffPermission[]): Promise<(string | null)[]> {
  const original = window.matchMedia;
  window.matchMedia = (media: string): MediaQueryList =>
    Object.assign(new EventTarget(), {
      matches: true,
      media,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    });
  try {
    configureApp(granted);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const launcher = fixture.debugElement.query(By.directive(FoldNavLauncherComponent));
    (launcher.componentInstance as FoldNavLauncherComponent).open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return [...root.querySelectorAll('a[fold-nav-tile]')]
      .filter((tile) => tile.getAttribute('href') === LINK)
      .map((tile) => tile.getAttribute('label'));
  } finally {
    window.matchMedia = original;
  }
}

describe("App — l'entrée Matrice des allergènes", () => {
  it('paraît au rail pour qui ne tient que allergen_matrix:read', () => {
    expect(railLabels(['allergen_matrix:read'])).toContain('Matrice des allergènes');
  });

  it('reste fermée à qui ne tient que le catalogue', () => {
    expect(railLabels(['pim_catalog:read'])).not.toContain('Matrice des allergènes');
  });

  it('se range juste sous le Catalogue', () => {
    const labels = railLabels(['pim_catalog:read', 'allergen_matrix:read']);
    expect(labels[labels.indexOf('Catalogue') + 1]).toBe('Matrice des allergènes');
  });

  it('paraît aussi aux tuiles du menu mobile, sous le même droit', async () => {
    expect(await tileLabels(['allergen_matrix:read'])).toEqual(['Matrice des allergènes']);
    expect(await tileLabels(['pim_catalog:read'])).toEqual([]);
  });
});
