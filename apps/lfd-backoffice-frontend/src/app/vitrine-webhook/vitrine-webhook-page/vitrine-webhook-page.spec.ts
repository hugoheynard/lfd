import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  StaffPermission,
  VitrineContent,
  VitrineNoticeView,
  VitrineSubscriberView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { VitrineWebhookService } from '../vitrine-webhook.service';
import { VitrineWebhookPage } from './vitrine-webhook-page';

function subscriber(overrides: Partial<VitrineSubscriberView> = {}): VitrineSubscriberView {
  return {
    id: 'sub_1',
    name: 'Agence du site',
    description: null,
    contactEmail: null,
    endpointUrl: 'https://agence.example/hook',
    contents: ['catalogue', 'texts'],
    state: 'active',
    failedAt: null,
    lastSequence: 4,
    createdAt: '2026-10-18T08:00:00.000Z',
    ...overrides,
  };
}

class FakeApi {
  subscribers: readonly VitrineSubscriberView[] = [subscriber()];
  failList = false;
  noticeList: readonly VitrineNoticeView[] = [];
  readonly calls: string[] = [];

  notices(): Promise<readonly VitrineNoticeView[]> {
    return Promise.resolve(this.noticeList);
  }

  list(): Promise<readonly VitrineSubscriberView[]> {
    return this.failList ? Promise.reject(new Error('réseau')) : Promise.resolve(this.subscribers);
  }
  setContents(id: string, contents: readonly VitrineContent[]): Promise<void> {
    this.calls.push(`contents:${id}:${contents.join(',')}`);
    return Promise.resolve();
  }
  resync(id: string): Promise<void> {
    this.calls.push(`resync:${id}`);
    return Promise.resolve();
  }
  test(id: string): Promise<void> {
    this.calls.push(`test:${id}`);
    return Promise.resolve();
  }
  resumeNotice(id: string): Promise<void> {
    this.calls.push(`resume:${id}`);
    return Promise.resolve();
  }
  setActive(id: string, active: boolean): Promise<void> {
    this.calls.push(`active:${id}:${String(active)}`);
    return Promise.resolve();
  }
}

async function render(
  api: FakeApi,
  granted: readonly StaffPermission[] = ['lfd_webhooks:read', 'lfd_webhooks:write'],
): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [VitrineWebhookPage],
    providers: [
      provideRouter([]),
      { provide: VitrineWebhookService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          permissions: signal(granted),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(VitrineWebhookPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('VitrineWebhookPage', () => {
  it('une panne se dit en alerte, avec Réessayer', async () => {
    const api = new FakeApi();
    api.failList = true;
    expect((await render(api)).textContent).toContain('Impossible de charger les abonnés');
  });

  it('montre chaque abonné, son adresse, son état et ses cases', async () => {
    const root = await render(new FakeApi());
    expect(root.textContent).toContain('Agence du site');
    expect(root.textContent).toContain('https://agence.example/hook');
    expect(root.querySelector('[data-state]')?.textContent?.trim()).toBe('Actif');
    expect(root.querySelectorAll('[data-content]')).toHaveLength(4);
  });

  it('décocher une case l’enregistre, sans toucher aux autres', async () => {
    const api = new FakeApi();
    const root = await render(api);
    const box = root.querySelector('[data-content="texts"] input');
    if (!(box instanceof HTMLInputElement)) throw new Error('case absente');
    box.click();
    await settle();
    expect(api.calls).toEqual(['contents:sub_1:catalogue']);
  });

  it('un abonné sans adresse se dit « Lecture seule — aucun envoi », sans bouton d’essai', async () => {
    const api = new FakeApi();
    api.subscribers = [subscriber({ endpointUrl: null })];
    const root = await render(api);
    expect(root.textContent).toContain('Lecture seule — aucun envoi');
    expect(root.querySelector('button[data-test]')).toBeNull();
    expect(root.querySelector('button[data-rotate]')).not.toBeNull();
  });

  it('un abonné pourvu d’une adresse garde son bouton d’essai', async () => {
    const root = await render(new FakeApi());
    expect(root.querySelector('button[data-test]')).not.toBeNull();
  });

  it('un abonné en échec propose « Tout renvoyer »', async () => {
    const api = new FakeApi();
    api.subscribers = [subscriber({ state: 'failing', failedAt: '2026-10-18T09:00:00.000Z' })];
    const root = await render(api);
    expect(root.querySelector('[data-state]')?.textContent?.trim()).toBe('En échec');
    root.querySelector<HTMLButtonElement>('button[data-resync]')?.click();
    await settle();
    expect(api.calls).toEqual(['resync:sub_1']);
  });

  it('sans l’écriture : rien ne se change, le journal se lit', async () => {
    const root = await render(new FakeApi(), ['lfd_webhooks:read']);
    expect(root.querySelector('button[data-create]')).toBeNull();
    expect(root.querySelector('button[data-test]')).toBeNull();
    expect(root.querySelector('button[data-journal]')).not.toBeNull();
  });

  it('sans abonné, le dit — rien n’est calculé', async () => {
    const api = new FakeApi();
    api.subscribers = [];
    expect((await render(api)).textContent).toContain('Aucun abonné');
  });

  it('« Notifier les abonnés » attend un contact ; les annonces se lisent avec leur issue', async () => {
    const api = new FakeApi();
    let root = await render(api);
    expect(root.querySelector<HTMLButtonElement>('button[data-notify]')?.disabled).toBe(true);
    expect(root.querySelector('[data-notices-empty]')).not.toBeNull();

    api.subscribers = [subscriber({ contactEmail: 'web@agence.example' })];
    api.noticeList = [
      {
        id: 'n1',
        authorStaffId: 'staff_1',
        authorName: 'Inès Boutique',
        subject: 'Le catalogue d’automne',
        message: 'Bonjour',
        createdAt: '2026-10-18T08:00:00.000Z',
        recipients: [
          {
            subscriberId: 'sub_1',
            subscriberName: 'Agence du site',
            contactEmail: 'web@agence.example',
            mailSent: true,
            attemptedAt: '2026-10-18T08:00:01.000Z',
          },
        ],
      },
    ];
    root = await render(api);
    expect(root.querySelector<HTMLButtonElement>('button[data-notify]')?.disabled).toBe(false);
    expect(root.querySelector('[data-notice]')?.textContent).toContain('Le catalogue d’automne');
    expect(root.querySelector('[data-notice-recipient]')?.textContent).toContain(
      'Accepté par l’envoi',
    );
    expect(root.textContent).toContain('pas qu’il');
    expect(root.querySelector('[data-notice]')?.textContent).toContain('par Inès Boutique');
    expect(root.querySelector('button[data-resume]')).toBeNull();
  });

  it('une annonce interrompue propose « Reprendre l’envoi », pour ses seuls pas tentés', async () => {
    const api = new FakeApi();
    api.subscribers = [subscriber({ contactEmail: 'web@agence.example' })];
    api.noticeList = [
      {
        id: 'n2',
        authorStaffId: 'staff_parti',
        authorName: null,
        subject: 'Coupée au milieu',
        message: 'Bonjour',
        createdAt: '2026-10-18T08:00:00.000Z',
        recipients: [
          {
            subscriberId: 'sub_1',
            subscriberName: 'Agence du site',
            contactEmail: 'web@agence.example',
            mailSent: true,
            attemptedAt: '2026-10-18T08:00:01.000Z',
          },
          {
            subscriberId: 'sub_2',
            subscriberName: 'Autre agence',
            contactEmail: 'autre@agence.example',
            mailSent: null,
            attemptedAt: null,
          },
        ],
      },
    ];
    const root = await render(api);
    expect(root.querySelector('[data-notice]')?.textContent).toContain('par staff_parti');
    const resume = root.querySelector<HTMLButtonElement>('button[data-resume]');
    expect(resume?.textContent).toContain('Reprendre l’envoi (1)');
    resume?.click();
    await settle();
    expect(api.calls).toEqual(['resume:n2']);

    const readOnly = await render(api, ['lfd_webhooks:read']);
    expect(readOnly.querySelector('button[data-resume]')).toBeNull();
  });

  it('sans l’écriture, pas de « Notifier les abonnés »', async () => {
    const root = await render(new FakeApi(), ['lfd_webhooks:read']);
    expect(root.querySelector('button[data-notify]')).toBeNull();
  });
});
