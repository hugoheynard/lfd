import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { FoldAppShellComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { App } from '../app';
import { PermissionsStore } from '../auth/permissions.store';
import { StaffAuth } from '../auth/staff-auth';
import { CustomerRequestsInbox } from '../b2b/demandes/customer-requests-inbox.store';
import { NavCountsService } from '../nav-counts.service';
import { PushNotificationsService } from '../shared/push/push-notifications.service';

/**
 * Le menu mobile suit l'état du SHELL, plus une largeur écrite dans l'app :
 * sur iPad (portrait ou paysage) le back-office passe au lanceur (Hugo,
 * 2026-10-05). Le rail replié propre au colisage est retiré au profit de ça.
 */
describe('App — la coquille', () => {
  function setup(granted: readonly string[] = []) {
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
            can: (permission: string) => granted.includes(permission),
            loaded: signal(true),
            permissions: signal(['b2b_growth:read']),
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
        {
          provide: CustomerRequestsInbox,
          useValue: { pendingCount: signal(3), refresh: async () => undefined },
        },
      ],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  }

  function render() {
    return setup().debugElement.query(By.directive(FoldAppShellComponent))
      .componentInstance as FoldAppShellComponent;
  }

  /** Régression : `phoneOrTablet` bornait à 1366 px, un iPad Pro paysage gardait le rail. */
  it('passe en mobile sur téléphone ET sur tout écran tactile, sans borne de largeur', () => {
    expect(render().mobileQuery()).toBe('(max-width: 768px), (pointer: coarse)');
  });

  /** Le libellé des entrées du rail principal, dans l'ordre. */
  function railLabels(granted: readonly string[]): string[] {
    const element = setup(granted).nativeElement as HTMLElement;
    return [...element.querySelectorAll('[fold-menu-item]')].map(
      (item) => item.getAttribute('label') ?? '',
    );
  }

  it('montre « Demandes clients » juste sous « Commandes », avec les deux droits de sa route', () => {
    const labels = railLabels(['b2b_orders:read', 'b2b_contact:read', 'b2b_settings:read']);
    expect(labels.indexOf('Demandes clients')).toBe(labels.indexOf('Commandes') + 1);
  });

  it('cache « Demandes clients » sans le mur `b2b_settings` de l’espace', () => {
    expect(railLabels(['b2b_orders:read', 'b2b_contact:read'])).not.toContain('Demandes clients');
  });
});
