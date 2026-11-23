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
 * **L'entrée « Export des ventes »** (plan
 * `commandes/export/plan-export-des-ventes.md`, E4) : au rail ET aux tuiles,
 * ouverte par le SEUL droit `exports:read`.
 */
@Component({ template: '' })
class Blank {}

const LINK = '/export-des-ventes';

function configureApp(granted: readonly StaffPermission[]): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([{ path: 'export-des-ventes', component: Blank }]),
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
          expired: signal(false),
          unavailable: signal(false),
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

describe("App — l'entrée Export des ventes", () => {
  it('paraît au rail pour qui ne tient que exports:read', () => {
    expect(railLabels(['exports:read'])).toContain('Export des ventes');
  });

  it('reste fermée à qui ne tient que la croissance', () => {
    expect(railLabels(['b2b_growth:read'])).not.toContain('Export des ventes');
  });

  it('paraît aussi aux tuiles du menu mobile, sous le même droit', async () => {
    expect(await tileLabels(['exports:read'])).toEqual(['Export des ventes']);
    expect(await tileLabels(['b2b_growth:read'])).toEqual([]);
  });
});
