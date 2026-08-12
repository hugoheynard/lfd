import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { StaffNotificationsSummary, StaffNotificationView } from '@lfd/contracts';

import { NotificationsPanel } from '../notifications-panel/notifications-panel';
import { StaffNotificationsService } from '../staff-notifications.service';

function notification(overrides: Partial<StaffNotificationView> = {}): StaffNotificationView {
  return {
    id: 'notif_1',
    kind: 'alert.account',
    subject: 'Alerte — Café Dupont',
    body: 'Produit jamais commandé',
    link: '/comptes-clients/company_1/alertes',
    occurredAt: '2026-08-11T09:00:00.000Z',
    readAt: null,
    readBy: null,
    ...overrides,
  };
}

/** La surface du service que le fil consomme réellement (ISP côté test). */
type NotificationsPort = Pick<StaffNotificationsService, 'summary' | 'markAllRead' | 'markRead'>;

/**
 * Double du transport. Il `satisfies` la surface publique du service — pas
 * d'assertion de type : une signature qui bougerait doit casser ce test, pas
 * être masquée par un cast.
 */
class FakeNotifications {
  current: StaffNotificationsSummary = { unread: 0, notifications: [] };
  readCalls: string[] = [];
  readAllCalls = 0;
  fail = false;

  summary(): Promise<StaffNotificationsSummary> {
    if (this.fail) {
      return Promise.reject(new Error('offline'));
    }
    return Promise.resolve(this.current);
  }

  markAllRead(): Promise<void> {
    this.readAllCalls += 1;
    return Promise.resolve();
  }

  markRead(id: string): Promise<void> {
    this.readCalls.push(id);
    return Promise.resolve();
  }
}

/** Ce que le panneau attend de son `PanelRef` : pouvoir se fermer. */
const PANEL_REF = { close: (): void => undefined } as unknown as FoldPanelRef;

async function render(fake: FakeNotifications): Promise<ComponentFixture<NotificationsPanel>> {
  TestBed.configureTestingModule({
    providers: [
      // Une route attrape-tout : le lien navigue pour de vrai, et une navigation
      // sans cible échouerait après la fin du test.
      provideRouter([{ path: '**', children: [] }]),
      { provide: StaffNotificationsService, useValue: fake satisfies NotificationsPort },
      { provide: FoldPanelRef, useValue: PANEL_REF },
    ],
  });
  const fixture = TestBed.createComponent(NotificationsPanel);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('NotificationsPanel', () => {
  it('affiche le fil du serveur, non lues marquées', async () => {
    const fake = new FakeNotifications();
    fake.current = { unread: 1, notifications: [notification()] };

    const fixture = await render(fake);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Alerte — Café Dupont');
    expect(host.querySelectorAll('.np-item--unread')).toHaveLength(1);
  });

  it('éteint la pastille sans attendre le serveur', async () => {
    const fake = new FakeNotifications();
    fake.current = { unread: 2, notifications: [notification(), notification({ id: 'n2' })] };

    const fixture = await render(fake);
    const markAll = [...fixture.nativeElement.querySelectorAll('button')].find((button) =>
      (button as HTMLButtonElement).textContent?.includes('Tout marquer'),
    ) as HTMLButtonElement;
    markAll.click();
    fixture.detectChanges();

    // Marquage optimiste : le DOM est déjà éteint, l'appel réseau suit.
    expect(fixture.nativeElement.querySelectorAll('.np-item--unread')).toHaveLength(0);
    expect(fake.readAllCalls).toBe(1);
  });

  it('ouvrir une notification vaut traitement', async () => {
    const fake = new FakeNotifications();
    fake.current = { unread: 1, notifications: [notification({ id: 'n7' })] };

    const fixture = await render(fake);
    (fixture.nativeElement.querySelector('.np-item') as HTMLAnchorElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fake.readCalls).toEqual(['n7']);
  });

  it('COMPTE les non lues plutôt que de croire le serveur sur parole', async () => {
    // Le compteur est dérivé de la liste : un `unread` servi à part diverge dès
    // le premier marquage optimiste, et ment au moment où on le consulte.
    const fake = new FakeNotifications();
    fake.current = { unread: 99, notifications: [notification(), notification({ id: 'n2' })] };

    const fixture = await render(fake);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2 non lues');
  });

  it('ne parle que dans le panneau quand le fil ne charge pas', async () => {
    const fake = new FakeNotifications();
    fake.fail = true;

    const fixture = await render(fake);

    // Un toast toutes les soixante secondes serait pire que le silence.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "Le fil n'a pas pu être chargé",
    );
  });
});
