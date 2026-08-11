import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { StaffNotificationsSummary, StaffNotificationView } from '@lfd/contracts';

import { NotificationBell } from '../notification-bell/notification-bell';
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

/** La surface du service que la cloche consomme réellement (ISP côté test). */
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

async function render(fake: FakeNotifications): Promise<ComponentFixture<NotificationBell>> {
  TestBed.configureTestingModule({
    providers: [
      // Une route attrape-tout : le lien navigue pour de vrai, et une navigation
      // sans cible échouerait après la fin du test.
      provideRouter([{ path: '**', children: [] }]),
      { provide: StaffNotificationsService, useValue: fake satisfies NotificationsPort },
    ],
  });
  const fixture = TestBed.createComponent(NotificationBell);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

/**
 * Clique la cloche. Le panneau est **toujours** dans le DOM (`fold-popover` le
 * pose derrière l'attribut natif `popover`) : ces tests portent donc sur ce qui
 * s'y rend et sur la relance à l'ouverture, pas sur la visibilité — celle-là
 * appartient au design system, et y est déjà couverte.
 */
async function openPanel(fixture: ComponentFixture<NotificationBell>): Promise<HTMLElement> {
  const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  trigger.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('NotificationBell', () => {
  it('affiche le fil et le compteur du serveur', async () => {
    const fake = new FakeNotifications();
    fake.current = { unread: 1, notifications: [notification()] };

    const fixture = await render(fake);
    const host = await openPanel(fixture);

    expect(host.textContent).toContain('Alerte — Café Dupont');
    expect(host.querySelectorAll('.nb-item--unread')).toHaveLength(1);
  });

  it('éteint la pastille sans attendre le serveur', async () => {
    const fake = new FakeNotifications();
    fake.current = { unread: 2, notifications: [notification(), notification({ id: 'n2' })] };

    const fixture = await render(fake);
    await openPanel(fixture);
    const markAll = [...fixture.nativeElement.querySelectorAll('button')].find((button) =>
      (button as HTMLButtonElement).textContent?.includes('Tout marquer'),
    ) as HTMLButtonElement;
    markAll.click();
    fixture.detectChanges();

    // Marquage optimiste : le DOM est déjà éteint, l'appel réseau suit.
    expect(fixture.nativeElement.querySelectorAll('.nb-item--unread')).toHaveLength(0);
    expect(fake.readAllCalls).toBe(1);
  });

  it('ouvrir une notification vaut traitement', async () => {
    const fake = new FakeNotifications();
    fake.current = { unread: 1, notifications: [notification({ id: 'n7' })] };

    const fixture = await render(fake);
    const host = await openPanel(fixture);
    (host.querySelector('.nb-item') as HTMLAnchorElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fake.readCalls).toEqual(['n7']);
  });

  it('ne parle que dans le panneau quand le fil ne charge pas', async () => {
    const fake = new FakeNotifications();
    fake.fail = true;

    const fixture = await render(fake);
    const host = await openPanel(fixture);

    // Un toast toutes les soixante secondes serait pire que le silence.
    expect(host.textContent).toContain("Le fil n'a pas pu être chargé");
  });
});
