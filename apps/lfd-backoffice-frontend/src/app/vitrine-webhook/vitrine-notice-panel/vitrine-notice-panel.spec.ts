import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  SendVitrineNoticePayload,
  VitrineNoticeDraftPayload,
  VitrineNoticePreviewView,
  VitrineSubscriberView,
} from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { VitrineWebhookService } from '../vitrine-webhook.service';
import { VitrineNoticePanel } from './vitrine-notice-panel';

function subscriber(id: string, contactEmail: string | null): VitrineSubscriberView {
  return {
    id,
    name: `Agence ${id}`,
    description: null,
    contactEmail,
    endpointUrl: 'https://agence.example/hook',
    contents: [],
    state: 'active',
    failedAt: null,
    lastSequence: 0,
    createdAt: '2026-10-18T08:00:00.000Z',
  };
}

const SUBSCRIBERS = [
  subscriber('a', 'a@agence.example'),
  subscriber('b', null),
  subscriber('c', 'c@agence.example'),
];

interface Wire {
  previews: VitrineNoticeDraftPayload[];
  sends: SendVitrineNoticePayload[];
  closes: unknown[];
  refuse: string | null;
}

let wire: Wire;

const PREVIEW: VitrineNoticePreviewView = {
  subject: 'Nouveautés',
  html: '<p>Bonjour</p>',
  recipients: [{ subscriberId: 'a', name: 'Agence a', contactEmail: 'a@agence.example' }],
};

async function boot(): Promise<ComponentFixture<VitrineNoticePanel>> {
  wire = { previews: [], sends: [], closes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [VitrineNoticePanel],
    providers: [
      {
        provide: VitrineWebhookService,
        useValue: {
          previewNotice: (payload: VitrineNoticeDraftPayload) => {
            wire.previews.push(payload);
            return wire.refuse === null
              ? Promise.resolve(PREVIEW)
              : Promise.reject(
                  new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }),
                );
          },
          sendNotice: (payload: SendVitrineNoticePayload) => {
            wire.sends.push(payload);
            return Promise.resolve('notice_1');
          },
        } satisfies Pick<VitrineWebhookService, 'previewNotice' | 'sendNotice'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(VitrineNoticePanel);
  fixture.componentRef.setInput('data', SUBSCRIBERS);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<VitrineNoticePanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function type(
  fixture: ComponentFixture<VitrineNoticePanel>,
  selector: string,
  value: string,
): void {
  const element = host(fixture).querySelector(selector);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`Champ ${selector} absent.`);
  }
  element.value = value;
  element.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function click(
  fixture: ComponentFixture<VitrineNoticePanel>,
  selector: string,
): Promise<void> {
  host(fixture).querySelector<HTMLButtonElement>(selector)?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function fill(fixture: ComponentFixture<VitrineNoticePanel>): void {
  type(fixture, '[data-subject] input', ' Nouveautés ');
  type(fixture, '[data-message] textarea', 'Bonjour');
}

describe('VitrineNoticePanel', () => {
  it('coche ceux qui ont un contact ; sans contact, la case est inactive', async () => {
    const fixture = await boot();
    const box = (id: string): HTMLInputElement | null =>
      host(fixture).querySelector<HTMLInputElement>(`[data-recipient="${id}"] input`);
    expect(box('a')?.checked).toBe(true);
    expect(box('b')?.disabled).toBe(true);
    expect(box('b')?.checked).toBe(false);
    expect(host(fixture).textContent).toContain('Sans contact');
  });

  it('rien ne part sans objet ni message', async () => {
    const fixture = await boot();
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('objet');
    expect(host(fixture).querySelector<HTMLButtonElement>('button[data-preview]')?.disabled).toBe(
      true,
    );
  });

  it('l’aperçu d’abord, puis « Envoyer » — tous ceux qui ont un contact partent à null', async () => {
    const fixture = await boot();
    fill(fixture);
    await click(fixture, 'button[data-preview]');
    expect(wire.previews).toEqual([
      { subject: 'Nouveautés', message: 'Bonjour', subscriberIds: null },
    ]);
    expect(wire.sends).toEqual([]);
    expect(host(fixture).querySelector('[data-preview-recipients]')?.textContent).toContain(
      'a@agence.example',
    );
    expect(host(fixture).querySelector('iframe')?.getAttribute('sandbox')).toBe('');

    await click(fixture, 'button[data-send]');
    expect(wire.sends).toHaveLength(1);
    expect(wire.sends[0]).toMatchObject({ subject: 'Nouveautés', subscriberIds: null });
    expect(wire.sends[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(wire.closes).toEqual(['notice_1']);
  });

  it('une sélection part en liste', async () => {
    const fixture = await boot();
    fill(fixture);
    host(fixture).querySelector<HTMLInputElement>('[data-recipient="c"] input')?.click();
    fixture.detectChanges();
    await click(fixture, 'button[data-preview]');
    expect(wire.previews[0]?.subscriberIds).toEqual(['a']);
  });

  it('dit le refus du serveur et reste à la saisie', async () => {
    const fixture = await boot();
    fill(fixture);
    wire.refuse = 'Aucun destinataire.';
    await click(fixture, 'button[data-preview]');
    expect(host(fixture).textContent).toContain('Aucun destinataire.');
    expect(host(fixture).querySelector('button[data-send]')).toBeNull();
  });
});
