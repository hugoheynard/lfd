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
function renderMenu(granted: readonly StaffPermission[]): HTMLElement {
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
  return fixture.nativeElement as HTMLElement;
}

function menuLinks(granted: readonly StaffPermission[], link: string): number {
  return renderMenu(granted).querySelectorAll(`a[fold-menu-item][routerLink="${link}"]`).length;
}

describe("App — l'entrée Production", () => {
  it('paraît pour qui ne tient que production_settings:read', () => {
    expect(menuLinks(['production_settings:read'], '/production')).toBeGreaterThan(0);
  });

  it('reste fermée sans aucun droit du fournil', () => {
    expect(menuLinks(['b2b_growth:read'], '/production')).toBe(0);
  });

  // La fournée est sortie au Fournil (2026-10-06) : qui ne tient qu'elle ne
  // doit plus voir une Production sans aucune vue.
  it('reste fermée pour qui ne tient que production_worksheet:read', () => {
    expect(menuLinks(['production_worksheet:read'], '/production')).toBe(0);
  });
});

describe("App — l'entrée Fournil", () => {
  it('paraît pour qui tient production_worksheet:read', () => {
    expect(menuLinks(['production_worksheet:read'], '/fournil')).toBe(1);
  });

  it('porte l’icône du croissant', () => {
    const entry = renderMenu(['production_worksheet:read']).querySelector(
      'a[fold-menu-item][routerLink="/fournil"]',
    );
    expect(entry?.getAttribute('icon')).toBe('croissant');
  });

  it('reste fermée sans la fiche d’atelier', () => {
    expect(menuLinks(['production_plan:read'], '/fournil')).toBe(0);
  });
});
