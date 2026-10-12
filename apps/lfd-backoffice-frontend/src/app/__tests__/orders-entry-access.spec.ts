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
 * **L'entrée « Commandes » du menu primaire** (Hugo, 2026-10-12) — dans les
 * DEUX arbres : le rail et les tuiles du menu mobile ne partagent pas leur
 * modèle, et une entrée posée d'un seul côté y est invisible de l'autre.
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
      provideRouter([{ path: 'commandes', component: Blank }]),
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

const RAIL = 'a[fold-menu-item][routerLink="/commandes"]';
const TILE = 'a[fold-nav-tile][routerLink="/commandes"]';

describe('App — l’entrée Commandes', () => {
  it('paraît au rail ET aux tuiles avec b2b_orders:read', () => {
    expect(render(['b2b_orders:read']).querySelector(RAIL)?.getAttribute('label')).toBe(
      'Commandes',
    );
    expect(render(['b2b_orders:read'], true).querySelector(TILE)?.getAttribute('label')).toBe(
      'Commandes',
    );
  });

  it('reste absente des deux sans ce droit', () => {
    expect(render(['b2b_companies:read']).querySelector(RAIL)).toBeNull();
    expect(render(['b2b_companies:read'], true).querySelector(TILE)).toBeNull();
  });
});
