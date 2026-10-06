import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { App } from '../app';
import { PermissionsStore } from '../auth/permissions.store';
import { StaffAuth } from '../auth/staff-auth';
import { NavCountsService } from '../nav-counts.service';
import { PushNotificationsService } from '../shared/push/push-notifications.service';

/**
 * **L'entrée Production s'ouvre aussi à qui ne tient que ses réglages**
 * (2026-10-06). `/production/reglages` lui était ouverte, mais le rail ne
 * proposait pas l'entrée : la page n'était joignable que par une URL tapée.
 */
function productionLinks(granted: readonly StaffPermission[]): number {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([]),
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
  const host = fixture.nativeElement as HTMLElement;
  return host.querySelectorAll('a[fold-menu-item][routerLink="/production"]').length;
}

describe("App — l'entrée Production", () => {
  it('paraît pour qui ne tient que production_settings:read', () => {
    expect(productionLinks(['production_settings:read'])).toBeGreaterThan(0);
  });

  it('reste fermée sans aucun droit du fournil', () => {
    expect(productionLinks(['b2b_growth:read'])).toBe(0);
  });
});
