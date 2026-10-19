import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  provideRouter,
  Router,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { FoldNavLauncherComponent } from 'fold-ng';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { App } from '../app';
import { adminRoutes } from '../admin/admin.routes';
import { firstAdminView } from '../admin/first-admin-view';
import type { AnyPermissionGuard } from '../auth/permission.guard';
import { PermissionsStore } from '../auth/permissions.store';
import { StaffAuth } from '../auth/staff-auth';
import { NavCountsService } from '../nav-counts.service';
import { PushNotificationsService } from '../shared/push/push-notifications.service';
import { WorkspaceCatalogue } from '../shared/workspace-rail/workspaces';

/**
 * **L'entrée Admin et son garde disent la même chose** (Hugo, 2026-10-19) :
 * on voit l'Admin, et on y entre, dès qu'on lit AU MOINS UNE de ses vues ;
 * `/admin` mène à la première d'entre elles. Le webhook de la vitrine y est
 * rangé depuis le même jour, dans les DEUX arbres (rail et lanceur mobile).
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

/** L'entrée Admin du rail principal, et le groupe Admin du lanceur. */
const RAIL_ADMIN = 'a[fold-menu-item][routerLink="/admin"]';
const LAUNCHER_ADMIN = 'fold-nav-group[label="Admin"]';

/** Le garde de `/admin`, rejoué contre ces droits : `true`, ou la redirection. */
async function enterAdmin(granted: readonly StaffPermission[]): Promise<boolean | string> {
  configure(granted);
  const guard: unknown = adminRoutes[0]?.canActivate?.[0];
  if (!isAnyOfGuard(guard)) {
    throw new Error("Le parent de l'Admin n'a plus son garde « l'un ou l'autre ».");
  }
  const outcome: unknown = await TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  if (outcome instanceof UrlTree) {
    return TestBed.inject(Router).serializeUrl(outcome);
  }
  if (typeof outcome !== 'boolean') {
    throw new Error('Le garde de l’Admin rend autre chose qu’une décision.');
  }
  return outcome;
}

function isAnyOfGuard(guard: unknown): guard is AnyPermissionGuard {
  return typeof guard === 'function' && 'anyOf' in guard;
}

/** Où mène `/admin` seul, sous ces droits. */
function landing(granted: readonly StaffPermission[]): string {
  configure(granted);
  return TestBed.runInInjectionContext(firstAdminView);
}

/** Les vues que le rail de l'Admin montre, sous ces droits. */
function adminViewKeys(granted: readonly StaffPermission[]): string[] {
  configure(granted);
  return TestBed.inject(WorkspaceCatalogue)
    .views('admin')()
    .map((view) => view.key);
}

function configure(granted: readonly StaffPermission[]): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          ensureLoaded: async () => undefined,
        },
      },
    ],
  });
}

describe("App — l'entrée Admin suit ses vues", () => {
  /**
   * Régression : l'entrée s'ouvrait sur `b2b_companies` OU `staff_access`, le
   * garde de `/admin` sur `b2b_companies` seul — qui n'avait que
   * `staff_access` voyait « Admin », cliquait, et se faisait renvoyer ailleurs
   * (corrigé le 2026-10-19).
   */
  it("staff_access seul : l'entrée Admin s'affiche et l'accès est refusé", async () => {
    expect(render(['staff_access:read']).querySelector(RAIL_ADMIN)).not.toBeNull();
    expect(render(['staff_access:read'], true).querySelector(LAUNCHER_ADMIN)).not.toBeNull();
    expect(await enterAdmin(['staff_access:read'])).toBe(true);
    expect(landing(['staff_access:read'])).toBe('/admin/utilisateurs');
  });

  it('lfd_webhooks seul : Admin paraît, avec la seule vue « Webhook vitrine »', async () => {
    expect(render(['lfd_webhooks:read']).querySelector(RAIL_ADMIN)).not.toBeNull();
    const launcher = render(['lfd_webhooks:read'], true).querySelector(LAUNCHER_ADMIN);
    const tiles = [...(launcher?.querySelectorAll('a[fold-nav-tile]') ?? [])];
    expect(tiles.map((tile) => tile.getAttribute('href'))).toEqual(['/admin/webhook-vitrine']);
    expect(adminViewKeys(['lfd_webhooks:read'])).toEqual(['webhook-vitrine']);
    expect(await enterAdmin(['lfd_webhooks:read'])).toBe(true);
    expect(landing(['lfd_webhooks:read'])).toBe('/admin/webhook-vitrine');
  });

  /** Régression : `shop_vitrine`, retiré le 2026-10-19, n'ouvre plus le webhook. */
  it("shop_vitrine seul : l'ancien droit ne fait plus paraître Admin", () => {
    expect(render(['shop_vitrine:read']).querySelector(RAIL_ADMIN)).toBeNull();
    expect(adminViewKeys(['shop_vitrine:read'])).toEqual([]);
  });

  it('garde « Accès à remettre » en tête pour qui lit les sociétés', () => {
    expect(landing(['b2b_companies:read', 'lfd_webhooks:read'])).toBe('/admin/acces-en-attente');
  });

  it("sans aucune de ses vues, ni l'entrée ni la porte", async () => {
    expect(render(['b2b_orders:read']).querySelector(RAIL_ADMIN)).toBeNull();
    expect(render(['b2b_orders:read'], true).querySelector(LAUNCHER_ADMIN)).toBeNull();
    expect(await enterAdmin(['b2b_orders:read'])).toBe('/commandes');
  });
});
