import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { type Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { StaffPermission } from '@lfd/contracts';
import { FoldNavLauncherComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { App } from '../app';
import { routes } from '../app.routes';
import { PermissionsStore } from '../auth/permissions.store';
import { StaffAuth } from '../auth/staff-auth';
import { NavCountsService } from '../nav-counts.service';
import { PushNotificationsService } from '../shared/push/push-notifications.service';

/**
 * **L'entrée « Tour manager »** : un seul écran depuis le 2026-10-26 (Hugo
 * retire l'onglet « Feuille de route » posé le matin même). L'entrée s'ouvre
 * à qui tient les tournées, au rail ET aux tuiles ; les anciennes adresses de
 * la feuille de route mènent aux tournées, `?jour=` compris.
 */
@Component({ template: '' })
class Blank {}

const LINK = '/tour-manager';

function configureApp(granted: readonly StaffPermission[]): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([{ path: 'tour-manager', component: Blank }]),
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

describe("App — l'entrée Tour manager (2026-10-26)", () => {
  it('paraît au rail pour qui tient les tournées, plus pour la seule feuille de route (retirée le 2026-10-26)', () => {
    expect(railLabels(['delivery_rounds:read'])).toContain('Tour manager');
    expect(railLabels(['delivery_run_sheet:read'])).not.toContain('Tour manager');
  });

  it('reste fermée au chargement seul', () => {
    expect(railLabels(['delivery_loading:read'])).not.toContain('Tour manager');
  });

  it('paraît aussi aux tuiles du menu mobile, sous les mêmes droits', async () => {
    expect(await tileLabels(['delivery_run_sheet:read'])).toEqual([]);
    expect(await tileLabels(['delivery_rounds:read'])).toEqual(['Tour manager']);
    expect(await tileLabels(['delivery_loading:read'])).toEqual([]);
  });
});

/**
 * Les redirections jouées par le VRAI routeur : les anciennes adresses de la
 * feuille de route vivent dans des favoris, `?jour=` compris. Les écrans sont
 * remplacés par une page vide ; les redirections sont celles de `app.routes`.
 */
describe('les anciennes adresses de la feuille de route (2026-10-26)', () => {
  function redirectsOnly(path: string): Route[] {
    const shell = routes.find((route) => route.path === path);
    return (shell?.children ?? []).filter((child) => child.redirectTo !== undefined);
  }

  async function land(url: string, granted: readonly StaffPermission[]): Promise<string> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'livraison', children: redirectsOnly('livraison') },
          {
            path: 'tour-manager',
            children: [...redirectsOnly('tour-manager'), { path: 'tournees', component: Blank }],
          },
          { path: '**', component: Blank },
        ]),
        {
          provide: PermissionsStore,
          useValue: {
            can: (permission: StaffPermission) => granted.includes(permission),
            ensureLoaded: async () => undefined,
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  it.each([
    ['/livraison?jour=2026-10-27', '/tour-manager/tournees?jour=2026-10-27'],
    ['/livraison/feuille-de-route?jour=2026-10-27', '/tour-manager/tournees?jour=2026-10-27'],
    ['/livraison/tournees?jour=2026-10-27', '/tour-manager/tournees?jour=2026-10-27'],
    ['/tour-manager/feuille-de-route?jour=2026-10-27', '/tour-manager/tournees?jour=2026-10-27'],
    ['/tour-manager?jour=2026-10-27', '/tour-manager/tournees?jour=2026-10-27'],
  ])('%s → %s', async (from, to) => {
    expect(await land(from, ['delivery_rounds:read'])).toBe(to);
  });
});
