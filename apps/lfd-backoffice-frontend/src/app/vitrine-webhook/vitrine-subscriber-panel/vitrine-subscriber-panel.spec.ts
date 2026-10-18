import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CreateVitrineSubscriberPayload, VitrineCredentialsView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { VitrineWebhookService } from '../vitrine-webhook.service';
import { VitrineSubscriberPanel } from './vitrine-subscriber-panel';

const CREDENTIALS: VitrineCredentialsView = {
  id: 'sub_1',
  signingSecret: 'vtrsec_SECRET',
  readKey: 'vtrkey_CLE',
};

interface Wire {
  creates: CreateVitrineSubscriberPayload[];
  closes: unknown[];
  refuse: string | null;
}

let wire: Wire;

async function boot(): Promise<ComponentFixture<VitrineSubscriberPanel>> {
  wire = { creates: [], closes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [VitrineSubscriberPanel],
    providers: [
      {
        provide: VitrineWebhookService,
        useValue: {
          create: (payload: CreateVitrineSubscriberPayload) => {
            wire.creates.push(payload);
            return wire.refuse === null
              ? Promise.resolve(CREDENTIALS)
              : Promise.reject(
                  new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }),
                );
          },
        } satisfies Pick<VitrineWebhookService, 'create'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(VitrineSubscriberPanel);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<VitrineSubscriberPanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function type(
  fixture: ComponentFixture<VitrineSubscriberPanel>,
  field: string,
  value: string,
): void {
  const input = host(fixture).querySelector(`[${field}] input`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`Champ ${field} absent.`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<VitrineSubscriberPanel>): Promise<void> {
  host(fixture).querySelector<HTMLButtonElement>('button[data-submit]')?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('VitrineSubscriberPanel', () => {
  it('refuse une adresse en http ou avec un paramètre, avant l’envoi', async () => {
    const fixture = await boot();
    type(fixture, 'data-name', 'Agence');
    type(fixture, 'data-url', 'https://agence.example/hook?token=1');
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('https://');
    expect(host(fixture).querySelector<HTMLButtonElement>('button[data-submit]')?.disabled).toBe(
      true,
    );
  });

  it('crée avec toutes les cases, puis montre le secret et la clé une fois', async () => {
    const fixture = await boot();
    type(fixture, 'data-name', ' Agence ');
    type(fixture, 'data-url', 'https://agence.example/hook');
    await submit(fixture);

    expect(wire.creates).toEqual([
      {
        name: 'Agence',
        endpointUrl: 'https://agence.example/hook',
        contents: ['catalogue', 'operations', 'texts', 'featured'],
      },
    ]);
    expect(host(fixture).querySelector('[data-secret] input')).toBeTruthy();
    expect(host(fixture).querySelector<HTMLInputElement>('[data-secret] input')?.value).toBe(
      'vtrsec_SECRET',
    );
    expect(host(fixture).querySelector<HTMLInputElement>('[data-read-key] input')?.value).toBe(
      'vtrkey_CLE',
    );
    expect(wire.closes).toEqual([]);

    host(fixture).querySelector<HTMLButtonElement>('button[data-done]')?.click();
    expect(wire.closes).toEqual(['created']);
  });

  it('dit le refus du serveur et garde le panneau ouvert', async () => {
    const fixture = await boot();
    wire.refuse = 'L’adresse de l’abonné doit commencer par https://';
    type(fixture, 'data-name', 'Agence');
    type(fixture, 'data-url', 'https://agence.example/hook');
    await submit(fixture);
    expect(host(fixture).textContent).toContain('doit commencer par https://');
    expect(wire.closes).toEqual([]);
  });
});
