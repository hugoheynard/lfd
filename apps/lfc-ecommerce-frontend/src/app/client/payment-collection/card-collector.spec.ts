import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CardCollection } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { StripeLoader } from '../stripe-loader.service';
import { CardCollector } from './card-collector';

/** Ce que Stripe rend à `confirmPayment`, réduit à ce que le service en lit. */
type Confirmation = { error: { message?: string } } | { paymentIntent: { status: string } };

interface Seen {
  loadedWith: string | null;
  elementsWith: unknown;
  mounted: boolean;
  updates: unknown[];
}

/** Un Stripe doublé — la seule frontière qu'on double. `null` : le script ne charge pas. */
function stripeLoader(seen: Seen, confirmation: Confirmation | null) {
  return {
    load: (key: string) => {
      seen.loadedWith = key;
      if (confirmation === null) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        elements: (options: unknown) => {
          seen.elementsWith = options;
          return {
            create: () => ({ mount: () => (seen.mounted = true) }),
            update: (options: unknown) => seen.updates.push(options),
          };
        },
        confirmPayment: () => Promise.resolve(confirmation),
      });
    },
  };
}

const EMBEDDED: CardCollection = {
  kind: 'embedded',
  provider: 'stripe',
  publishableKey: 'pk_test_1',
  token: 'pi_1_secret',
};

function collector(
  confirmation: Confirmation | null,
  assign: (url: string) => void = () => undefined,
): { service: CardCollector; seen: Seen } {
  const seen: Seen = { loadedWith: null, elementsWith: null, mounted: false, updates: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: StripeLoader, useValue: stripeLoader(seen, confirmation) },
      { provide: DOCUMENT, useValue: { location: { assign } } },
    ],
  });
  return { service: TestBed.inject(CardCollector), seen };
}

const host = (): HTMLElement => globalThis.document.createElement('div');

describe('CardCollector — le seul endroit qui connaît un prestataire', () => {
  it('monte le formulaire Stripe avec la clé publique et le jeton de l’instruction', async () => {
    const { service, seen } = collector({ paymentIntent: { status: 'succeeded' } });

    const mounted = await service.mount(EMBEDDED, host(), 'fr');

    expect(mounted).not.toBeNull();
    expect(seen.loadedWith).toBe('pk_test_1');
    expect(seen.elementsWith).toEqual({ clientSecret: 'pi_1_secret', locale: 'fr' });
    expect(seen.mounted).toBe(true);
  });

  it('rend « encaissé » quand Stripe confirme', async () => {
    const { service } = collector({ paymentIntent: { status: 'succeeded' } });
    const mounted = await service.mount(EMBEDDED, host(), 'fr');

    expect(await mounted?.collect()).toEqual({ kind: 'succeeded' });
  });

  it('rend le refus avec la phrase de Stripe, écrite pour le porteur', async () => {
    const { service } = collector({ error: { message: 'Fonds insuffisants.' } });
    const mounted = await service.mount(EMBEDDED, host(), 'fr');

    expect(await mounted?.collect()).toEqual({ kind: 'refused', message: 'Fonds insuffisants.' });
  });

  it('rend un refus sans phrase quand Stripe n’en donne pas', async () => {
    const { service } = collector({ error: {} });
    const mounted = await service.mount(EMBEDDED, host(), 'fr');

    expect(await mounted?.collect()).toEqual({ kind: 'refused', message: null });
  });

  it('rend « inachevé » pour une intention ni refusée ni encaissée', async () => {
    const { service } = collector({ paymentIntent: { status: 'processing' } });
    const mounted = await service.mount(EMBEDDED, host(), 'fr');

    expect(await mounted?.collect()).toEqual({ kind: 'unfinished' });
  });

  it('ne repasse la langue au formulaire que sur un changement', async () => {
    const { service, seen } = collector({ paymentIntent: { status: 'succeeded' } });
    const mounted = await service.mount(EMBEDDED, host(), 'fr');

    mounted?.setLocale('fr');
    mounted?.setLocale('it');
    mounted?.setLocale('it');

    expect(seen.updates).toEqual([{ locale: 'it' }]);
  });

  it('rend null quand le script du prestataire ne se charge pas', async () => {
    const { service } = collector(null);

    expect(await service.mount(EMBEDDED, host(), 'fr')).toBeNull();
  });

  it('rend null pour un prestataire que la boutique ne sait pas monter', async () => {
    const { service, seen } = collector({ paymentIntent: { status: 'succeeded' } });

    expect(await service.mount({ ...EMBEDDED, provider: 'autre' }, host(), 'fr')).toBeNull();
    expect(seen.loadedWith).toBeNull();
  });

  it('envoie le client chez le prestataire pour une redirection, sans rien monter', async () => {
    const assign = vi.fn();
    const { service, seen } = collector({ paymentIntent: { status: 'succeeded' } }, assign);

    const mounted = await service.mount(
      { kind: 'redirect', provider: 'banque', url: 'https://banque.test/payer/1' },
      host(),
      'fr',
    );

    expect(seen.loadedWith).toBeNull();
    expect(await mounted?.collect()).toEqual({ kind: 'redirected' });
    expect(assign).toHaveBeenCalledWith('https://banque.test/payer/1');
  });
});
