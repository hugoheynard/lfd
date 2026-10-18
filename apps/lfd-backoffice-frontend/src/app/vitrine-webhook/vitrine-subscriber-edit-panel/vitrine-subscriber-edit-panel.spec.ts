import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { UpdateVitrineSubscriberIdentityPayload, VitrineSubscriberView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { VitrineWebhookService } from '../vitrine-webhook.service';
import { VitrineSubscriberEditPanel } from './vitrine-subscriber-edit-panel';

const SUBSCRIBER: VitrineSubscriberView = {
  id: 'sub_1',
  name: 'Agence',
  description: 'Le site public.',
  contactEmail: 'web@agence.example',
  endpointUrl: 'https://agence.example/hook',
  contents: ['catalogue'],
  state: 'active',
  failedAt: null,
  lastSequence: 0,
  createdAt: '2026-10-18T08:00:00.000Z',
};

interface Wire {
  updates: { id: string; payload: UpdateVitrineSubscriberIdentityPayload }[];
  closes: unknown[];
  refuse: string | null;
}

let wire: Wire;

async function boot(): Promise<ComponentFixture<VitrineSubscriberEditPanel>> {
  wire = { updates: [], closes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [VitrineSubscriberEditPanel],
    providers: [
      {
        provide: VitrineWebhookService,
        useValue: {
          updateIdentity: (id: string, payload: UpdateVitrineSubscriberIdentityPayload) => {
            wire.updates.push({ id, payload });
            return wire.refuse === null
              ? Promise.resolve()
              : Promise.reject(
                  new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }),
                );
          },
        } satisfies Pick<VitrineWebhookService, 'updateIdentity'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(VitrineSubscriberEditPanel);
  fixture.componentRef.setInput('data', SUBSCRIBER);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<VitrineSubscriberEditPanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function field(
  fixture: ComponentFixture<VitrineSubscriberEditPanel>,
  selector: string,
): HTMLInputElement | HTMLTextAreaElement {
  const element = host(fixture).querySelector(selector);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element;
  }
  throw new Error(`Champ ${selector} absent.`);
}

function type(
  fixture: ComponentFixture<VitrineSubscriberEditPanel>,
  selector: string,
  value: string,
): void {
  const element = field(fixture, selector);
  element.value = value;
  element.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<VitrineSubscriberEditPanel>): Promise<void> {
  host(fixture).querySelector<HTMLButtonElement>('button[data-submit]')?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('VitrineSubscriberEditPanel', () => {
  it('part des valeurs de l’abonné', async () => {
    const fixture = await boot();
    expect(field(fixture, '[data-name] input').value).toBe('Agence');
    expect(field(fixture, '[data-description] textarea').value).toBe('Le site public.');
    expect(field(fixture, '[data-contact] input').value).toBe('web@agence.example');
  });

  it('enregistre le nom, et une description ou un contact vidés partent à null', async () => {
    const fixture = await boot();
    type(fixture, '[data-name] input', ' Agence Lumière ');
    type(fixture, '[data-description] textarea', '   ');
    type(fixture, '[data-contact] input', '');
    await submit(fixture);
    expect(wire.updates).toEqual([
      { id: 'sub_1', payload: { name: 'Agence Lumière', description: null, contactEmail: null } },
    ]);
    expect(wire.closes).toEqual(['saved']);
  });

  it('refuse un nom vide avant l’envoi', async () => {
    const fixture = await boot();
    type(fixture, '[data-name] input', '  ');
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('obligatoire');
    expect(host(fixture).querySelector<HTMLButtonElement>('button[data-submit]')?.disabled).toBe(
      true,
    );
  });

  it('dit le refus du serveur et garde le panneau ouvert', async () => {
    const fixture = await boot();
    wire.refuse = 'Le nom de l’abonné est obligatoire.';
    await submit(fixture);
    expect(host(fixture).textContent).toContain('obligatoire');
    expect(wire.closes).toEqual([]);
  });
});
