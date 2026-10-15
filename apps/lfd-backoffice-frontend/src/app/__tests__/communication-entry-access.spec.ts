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
 * **Le pied de page et le contact en section « Communication »** (Hugo,
 * 2026-10-15) — dans les DEUX arbres : le rail et les tuiles du menu mobile ne
 * partagent pas leur modèle, et une entrée posée d'un seul côté y est
 * invisible de l'autre. Chacun garde le droit qu'il avait dans l'espace
 * E-commerce, et la section ne s'ouvre qu'à qui tient l'un de ses droits.
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

const SECTION = 'fold-menu-section[label="Communication"]';

describe('App — Communication', () => {
  it('montre « Pied de page » sous b2b_settings:read, dans les deux arbres', () => {
    const entry = render(['b2b_settings:read']).querySelector(rail('/pied-de-page'));
    expect(entry?.getAttribute('label')).toBe('Pied de page');
    expect(entry?.closest('fold-menu-section')?.getAttribute('label')).toBe('Communication');
    expect(
      render(['b2b_settings:read'], true)
        .querySelector(tile('/pied-de-page'))
        ?.getAttribute('label'),
    ).toBe('Pied de page');
    expect(render(['b2b_contact:read']).querySelector(rail('/pied-de-page'))).toBeNull();
  });

  it('montre « Contact » sous b2b_contact:read seul, dans les deux arbres', () => {
    const entry = render(['b2b_contact:read']).querySelector(rail('/contact'));
    expect(entry?.getAttribute('label')).toBe('Contact');
    expect(entry?.closest('fold-menu-section')?.getAttribute('label')).toBe('Communication');
    expect(
      render(['b2b_contact:read'], true).querySelector(tile('/contact'))?.getAttribute('label'),
    ).toBe('Contact');
    expect(render(['b2b_settings:read']).querySelector(rail('/contact'))).toBeNull();
  });

  it('ne montre pas la vitrine à qui n’a que le droit du pied de page ou du contact', () => {
    const host = render(['b2b_settings:read', 'b2b_contact:read']);
    expect(host.querySelector(SECTION)).not.toBeNull();
    expect(host.querySelector(rail('/vitrine'))).toBeNull();
  });

  it('reste fermée sans aucun de ses droits', () => {
    expect(render(['b2b_orders:read', 'pim_catalog:read']).querySelector(SECTION)).toBeNull();
  });

  /**
   * Par le `href` rendu : les entrées de l'espace sont liées par
   * `[routerLink]="view.link"`, qui ne laisse aucun attribut à lire.
   */
  it("ne garde plus les anciennes entrées de l'E-commerce, ni au rail ni aux tuiles", () => {
    const granted: readonly StaffPermission[] = ['b2b_settings:read', 'b2b_contact:read'];
    for (const host of [render(granted), render(granted, true)]) {
      expect(host.querySelector('a[href="/pied-de-page"]')).not.toBeNull();
      expect(host.querySelector('a[href="/b2b/contenu/app-footer"]')).toBeNull();
      expect(host.querySelector('a[href="/b2b/contact"]')).toBeNull();
    }
  });
});
