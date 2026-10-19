import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { VitrineDeliveryView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VitrineWebhookService } from '../vitrine-webhook.service';
import { VitrineJournalPanel, type VitrineJournalData } from './vitrine-journal-panel';

const NONE = { items: [], operations: [], shelves: [], texts: [] };

const FAILED: VitrineDeliveryView = {
  id: 'd1',
  dispatchId: 'disp_01JX',
  kind: 'change',
  sequence: 2,
  state: 'failed',
  attempts: 10,
  nextAttemptAt: null,
  lastError: 'l’abonné a répondu HTTP 503',
  lastStatus: 503,
  changed: { ...NONE, items: ['CRO-01'] },
  removed: NONE,
  createdAt: '2026-10-18T08:00:00.000Z',
  deliveredAt: null,
};

const DATA: VitrineJournalData = {
  subscriber: {
    id: 'sub_1',
    name: 'Agence',
    description: null,
    contactEmail: null,
    endpointUrl: 'https://agence.example/hook',
    contents: ['catalogue'],
    state: 'failing',
    failedAt: '2026-10-18T09:00:00.000Z',
    lastSequence: 2,
    createdAt: '2026-10-18T08:00:00.000Z',
  },
  canWrite: true,
};

const calls: string[] = [];

async function boot(
  data: VitrineJournalData = DATA,
): Promise<ComponentFixture<VitrineJournalPanel>> {
  calls.splice(0);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [VitrineJournalPanel],
    providers: [
      {
        provide: VitrineWebhookService,
        useValue: {
          deliveries: () => Promise.resolve([FAILED]),
          resend: (id: string) => {
            calls.push(`resend:${id}`);
            return Promise.resolve();
          },
          resync: (id: string) => {
            calls.push(`resync:${id}`);
            return Promise.resolve();
          },
        } satisfies Pick<VitrineWebhookService, 'deliveries' | 'resend' | 'resync'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
    ],
  });
  const fixture = TestBed.createComponent(VitrineJournalPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

async function settle(fixture: ComponentFixture<VitrineJournalPanel>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<VitrineJournalPanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('VitrineJournalPanel', () => {
  it('dit chaque envoi, son état et pourquoi il a échoué', async () => {
    const fixture = await boot();
    expect(host(fixture).textContent).toContain('Envoi n° 2');
    expect(host(fixture).textContent).toContain('Changés : 1 article');
    expect(host(fixture).textContent).toContain('HTTP 503');
    expect(host(fixture).querySelector('[data-state]')?.textContent?.trim()).toBe('En échec');
  });

  it('renvoie un envoi, et « Tout renvoyer » resynchronise l’abonné', async () => {
    const fixture = await boot();
    host(fixture).querySelector<HTMLButtonElement>('button[data-resend]')?.click();
    await settle(fixture);
    host(fixture).querySelector<HTMLButtonElement>('button[data-resync]')?.click();
    await settle(fixture);
    expect(calls).toEqual(['resend:d1', 'resync:sub_1']);
  });

  it('sans l’écriture, aucun geste', async () => {
    const fixture = await boot({ ...DATA, canWrite: false });
    expect(host(fixture).querySelector('button[data-resend]')).toBeNull();
    expect(host(fixture).querySelector('button[data-resync]')).toBeNull();
  });

  describe('l’identifiant d’envoi', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('s’affiche sur chaque envoi, et se copie', async () => {
      const copied: string[] = [];
      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: (text: string) => {
            copied.push(text);
            return Promise.resolve();
          },
        },
      });
      const fixture = await boot({ ...DATA, canWrite: false });
      expect(host(fixture).querySelector('[data-dispatch]')?.textContent).toContain('disp_01JX');
      host(fixture).querySelector<HTMLButtonElement>('button[data-copy-dispatch]')?.click();
      await settle(fixture);
      expect(copied).toEqual(['disp_01JX']);
      expect(host(fixture).querySelector('[data-notice]')?.textContent).toContain('copié');
    });

    it('un refus du navigateur l’affiche pour être copié à la main', async () => {
      vi.stubGlobal('navigator', {
        clipboard: { writeText: () => Promise.reject(new Error('refusé')) },
      });
      const fixture = await boot();
      host(fixture).querySelector<HTMLButtonElement>('button[data-copy-dispatch]')?.click();
      await settle(fixture);
      expect(host(fixture).querySelector('[data-notice]')?.textContent).toContain(
        'Identifiant d’envoi à copier : disp_01JX',
      );
    });
  });
});
