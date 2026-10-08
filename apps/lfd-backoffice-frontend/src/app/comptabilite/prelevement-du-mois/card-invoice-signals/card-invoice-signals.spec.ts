import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CardInvoiceRetryView, CardInvoiceSignalView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { CardInvoicesService } from '../../card-invoices.service';
import { CardInvoiceSignals } from './card-invoice-signals';

/** Des instants seulement affichés : aucun n'est comparé à l'horloge. */
const SIGNAL: CardInvoiceSignalView = {
  orderId: 'o_1',
  orderNumber: 'CMD-001',
  payerCompanyId: 'c_port',
  payerName: 'Boulangerie du Port',
  message: "La facture ne peut pas être émise : l'acheteur n'a pas de numéro de TVA.",
  recordedAt: '2030-03-12T08:10:00.000Z',
};

interface World {
  readonly fixture: ComponentFixture<CardInvoiceSignals>;
  readonly retried: string[];
  readonly said: string[];
}

async function boot(
  signals: () => Promise<{ signaled: readonly CardInvoiceSignalView[] }>,
  canWrite = true,
  retry: CardInvoiceRetryView = { outcome: 'issued', number: 'FA-2030-000001', message: null },
): Promise<World> {
  const retried: string[] = [];
  const said: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: CardInvoicesService,
        useValue: {
          signals,
          retry: (orderId: string) => {
            retried.push(orderId);
            return Promise.resolve(retry);
          },
        } satisfies Pick<CardInvoicesService, 'signals' | 'retry'>,
      },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => said.push(message),
          info: (message: string) => said.push(message),
          error: () => undefined,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CardInvoiceSignals);
  fixture.componentRef.setInput('canWrite', canWrite);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, retried, said };
}

const element = (world: World): HTMLElement => world.fixture.nativeElement as HTMLElement;

describe('CardInvoiceSignals', () => {
  it('ne rend rien sans signalement', async () => {
    const world = await boot(() => Promise.resolve({ signaled: [] }));
    expect(element(world).querySelector('[data-card-signals]')).toBeNull();
  });

  it('nomme la commande, le payeur et le refus en clair', async () => {
    const world = await boot(() => Promise.resolve({ signaled: [SIGNAL] }));
    const text = element(world).querySelector('[data-card-signals]')?.textContent ?? '';

    expect(text).toContain('CMD-001');
    expect(text).toContain('Boulangerie du Port');
    expect(text).toContain('numéro de TVA');
  });

  it('« Réessayer » rejoue la commande et dit ce qui est parti', async () => {
    const world = await boot(() => Promise.resolve({ signaled: [SIGNAL] }));
    const button = element(world).querySelector<HTMLButtonElement>('[data-card-retry="o_1"]');
    button?.click();
    await world.fixture.whenStable();

    expect(world.retried).toEqual(['o_1']);
    expect(world.said[0]).toContain('Facture émise');
    expect(world.said[0]).toContain('FA-2030-000001');
  });

  it("sans le droit d'écriture, aucun bouton", async () => {
    const world = await boot(() => Promise.resolve({ signaled: [SIGNAL] }), false);
    expect(element(world).querySelector('[data-card-retry]')).toBeNull();
  });

  it('dit un échec de lecture', async () => {
    const world = await boot(() => Promise.reject(new Error('500')));
    expect(element(world).querySelector('[data-card-signals-error]')).not.toBeNull();
  });
});
