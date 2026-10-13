import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { FoldNavLauncherComponent } from 'fold-ng';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { App } from '../app';
import { PimCapabilitiesStore } from '../pim/capabilities/pim-capabilities.store';
import { PermissionsStore } from '../auth/permissions.store';
import { StaffAuth } from '../auth/staff-auth';
import { NavCountsService } from '../nav-counts.service';
import { PushNotificationsService } from '../shared/push/push-notifications.service';

/**
 * **La section « Gestion Boutique » et la Médiathèque de premier niveau**
 * (Hugo, 2026-10-13) — dans les DEUX arbres : le rail et les tuiles du menu
 * mobile ne partagent pas leur modèle, et une entrée posée d'un seul côté y
 * est invisible de l'autre. Chaque entrée garde le droit de sa route.
 */
@Component({ template: '' })
class Blank {}

/**
 * Le lanceur de tuiles n'existe qu'en coquille MOBILE : `mobile` fait croire
 * à un écran tactile (toute requête média répond oui), puis ouvre le lanceur.
 */
function render(granted: readonly StaffPermission[], mobile = false): HTMLElement {
  const original = window.matchMedia;
  if (mobile) {
    window.matchMedia = (media: string): MediaQueryList => {
      const list = new EventTarget();
      return Object.assign(list, {
        matches: true,
        media,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
      });
    };
  }
  try {
    return mount(granted, mobile);
  } finally {
    window.matchMedia = original;
  }
}

function mount(granted: readonly StaffPermission[], mobile: boolean): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([{ path: '**', component: Blank }]),
      { provide: PimCapabilitiesStore, useValue: { publication: () => true } },
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
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  if (mobile) {
    const launcher = fixture.debugElement.query(By.directive(FoldNavLauncherComponent));
    (launcher.componentInstance as FoldNavLauncherComponent).open.set(true);
    fixture.detectChanges();
  }
  return fixture.nativeElement as HTMLElement;
}

function rail(link: string): string {
  return `a[fold-menu-item][routerLink="${link}"]`;
}
function tile(link: string): string {
  return `a[fold-nav-tile][routerLink="${link}"]`;
}

describe('App — Gestion Boutique', () => {
  it('montre « Opérations datées » sous pim_catalog:read, dans les deux arbres', () => {
    const link = '/operations';
    expect(render(['pim_catalog:read']).querySelector(rail(link))?.getAttribute('label')).toBe(
      'Opérations datées',
    );
    expect(
      render(['pim_catalog:read'], true).querySelector(tile(link))?.getAttribute('label'),
    ).toBe('Opérations datées');
    expect(render(['b2b_settings:read']).querySelector(rail(link))).toBeNull();
  });

  it('montre « Promotions » sous b2b_settings:read, dans les deux arbres', () => {
    const link = '/promotions';
    expect(render(['b2b_settings:read']).querySelector(rail(link))?.getAttribute('label')).toBe(
      'Promotions',
    );
    expect(
      render(['b2b_settings:read'], true).querySelector(tile(link))?.getAttribute('label'),
    ).toBe('Promotions');
    expect(render(['pim_catalog:read']).querySelector(rail(link))).toBeNull();
  });

  it('est absente sans aucun des deux droits', () => {
    const host = render(['b2b_orders:read']);
    expect(host.querySelector('fold-menu-section[label="Gestion Boutique"]')).toBeNull();
  });
});

describe('App — la Médiathèque au premier niveau', () => {
  it('paraît hors de toute section, dans les deux arbres, avec media_library:read seul', () => {
    const entry = render(['media_library:read']).querySelector(rail('/mediatheque'));
    expect(entry?.getAttribute('label')).toBe('Médiathèque');
    expect(entry?.closest('fold-menu-section')).toBeNull();
    expect(render(['media_library:read'], true).querySelector(tile('/mediatheque'))).not.toBeNull();
  });

  it('ne fait plus apparaître la section Communication à elle seule', () => {
    expect(
      render(['media_library:read']).querySelector('fold-menu-section[label="Communication"]'),
    ).toBeNull();
  });
});
