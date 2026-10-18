import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { StaffPermission, VitrineContent, VitrineSubscriberView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { VitrineWebhookService } from '../vitrine-webhook.service';
import { VitrineWebhookPage } from './vitrine-webhook-page';

function subscriber(overrides: Partial<VitrineSubscriberView> = {}): VitrineSubscriberView {
  return {
    id: 'sub_1',
    name: 'Agence du site',
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
  readonly calls: string[] = [];

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
  setActive(id: string, active: boolean): Promise<void> {
    this.calls.push(`active:${id}:${String(active)}`);
    return Promise.resolve();
  }
}

async function render(
  api: FakeApi,
  granted: readonly StaffPermission[] = ['shop_vitrine:read', 'shop_vitrine:write'],
): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [VitrineWebhookPage],
    providers: [
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
    const root = await render(new FakeApi(), ['shop_vitrine:read']);
    expect(root.querySelector('button[data-create]')).toBeNull();
    expect(root.querySelector('button[data-test]')).toBeNull();
    expect(root.querySelector('button[data-journal]')).not.toBeNull();
  });

  it('sans abonné, le dit — rien n’est calculé', async () => {
    const api = new FakeApi();
    api.subscribers = [];
    expect((await render(api)).textContent).toContain('Aucun abonné');
  });
});
