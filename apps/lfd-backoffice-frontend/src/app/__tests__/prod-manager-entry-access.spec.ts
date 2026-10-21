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
 * **L'entrée « Prod manager »** depuis le lot R3d
 * (`reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-21) : l'ancienne
 * entrée « Réassorts » est devenue un onglet de Prod manager. L'entrée
 * s'ouvre donc à qui tient le prévisionnel OU la seule fournée (le droit de
 * l'ancienne entrée), au rail ET aux tuiles ; « Réassorts » n'y est plus.
 */
@Component({ template: '' })
class Blank {}

const LINK = '/prod-manager';

function configureApp(granted: readonly StaffPermission[]): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([
        { path: 'prod-manager', component: Blank },
        { path: 'fournil', component: Blank },
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

describe("App — l'entrée Prod manager (R3d)", () => {
  it('paraît au rail pour qui tient le prévisionnel, ou la seule fournée', () => {
    expect(railLabels(['production_plan:read'])).toContain('Prod manager');
    expect(railLabels(['production_worksheet:read'])).toContain('Prod manager');
  });

  it("n'a plus d'entrée « Réassorts » à part", () => {
    expect(railLabels(['production_worksheet:read', 'production_plan:read'])).not.toContain(
      'Réassorts',
    );
  });

  it('reste fermée au comptoir seul', () => {
    expect(railLabels(['handover_counter:write'])).not.toContain('Prod manager');
  });

  it('paraît aussi aux tuiles du menu mobile, sous le même droit', async () => {
    expect(await tileLabels(['production_worksheet:read'])).toEqual(['Prod manager']);
    expect(await tileLabels(['handover_counter:write'])).toEqual([]);
  });
});
