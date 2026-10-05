import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { FoldAppShellComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { App } from '../app';
import { PermissionsStore } from '../auth/permissions.store';
import { StaffAuth } from '../auth/staff-auth';
import { NavCountsService } from '../nav-counts.service';
import { PushNotificationsService } from '../shared/push/push-notifications.service';

/**
 * Le menu mobile suit l'état du SHELL, plus une largeur écrite dans l'app :
 * sur iPad (portrait ou paysage) le back-office passe au lanceur (Hugo,
 * 2026-10-05). Le rail replié propre au colisage est retiré au profit de ça.
 */
describe('App — la coquille', () => {
  function render() {
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
            can: () => false,
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
      ],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(FoldAppShellComponent))
      .componentInstance as FoldAppShellComponent;
  }

  it('passe en mobile sur téléphone ET tablette (`phoneOrTablet`)', () => {
    expect(render().mobileQuery()).toBe('phoneOrTablet');
  });
});
