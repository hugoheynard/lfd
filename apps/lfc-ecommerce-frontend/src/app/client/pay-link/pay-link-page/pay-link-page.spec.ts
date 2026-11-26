import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { CardCollection, PayLinkView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { payLinkCopy } from '../../copy/screens/pay-link.copy';
import {
  CardCollector,
  type CollectOutcome,
  type MountedCollection,
} from '../../payment-collection/card-collector';
import {
  PayLinkGateway,
  type PayLinkIntentResult,
  type PayLinkViewResult,
} from '../pay-link.gateway';
import { PayLinkPage } from './pay-link-page';

const FR = payLinkCopy('fr');
const TOKEN = 'a'.repeat(43);

const PAYABLE: PayLinkView = {
  payable: true,
  amountCents: 12_345,
  payeeName: 'La Folie Douce',
  payerName: 'Boulangerie Martin',
  reference: 'F-2026-0042',
  dueOn: '2026-12-15',
};

const COLLECTION: CardCollection = {
  kind: 'embedded',
  provider: 'stripe',
  publishableKey: 'pk_test',
  token: 'secret',
};

const READY_INTENT: PayLinkIntentResult = {
  kind: 'ready',
  intent: { collection: COLLECTION, amountCents: 12_345 },
};

/** Le service de collecte doublé : la page ne voit jamais un prestataire. */
class FakeCollector implements Pick<CardCollector, 'mount'> {
  readonly outcomes: CollectOutcome[] = [];
  /** Le nom passé à chaque collecte : le payeur d'un lien reste anonyme. */
  readonly payerNames: unknown[] = [];
  mounted = 0;
  constructor(private readonly mountable: boolean | 'throws' = true) {}

  mount(): Promise<MountedCollection | null> {
    this.mounted += 1;
    if (this.mountable === 'throws') {
      return Promise.reject(new Error('script injoignable'));
    }
    if (!this.mountable) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      setLocale: () => undefined,
      collect: (payerName?: string | null) => {
        this.payerNames.push(payerName);
        return Promise.resolve(this.outcomes.shift() ?? { kind: 'succeeded' });
      },
    });
  }
}

class FakeGateway implements Pick<PayLinkGateway, 'view' | 'intent'> {
  readonly calls: string[] = [];
  constructor(
    private readonly views: PayLinkViewResult[],
    private readonly intents: PayLinkIntentResult[] = [READY_INTENT],
  ) {}

  view(token: string): Promise<PayLinkViewResult> {
    this.calls.push(`view:${token}`);
    return Promise.resolve(next(this.views));
  }

  intent(token: string): Promise<PayLinkIntentResult> {
    this.calls.push(`intent:${token}`);
    return Promise.resolve(next(this.intents));
  }
}

function next<T>(queue: T[]): T {
  const head = queue.length > 1 ? queue.shift() : queue[0];
  if (head === undefined) {
    throw new Error('file vide');
  }
  return head;
}

interface Booted {
  readonly fixture: ComponentFixture<PayLinkPage>;
  readonly el: HTMLElement;
  readonly gateway: FakeGateway;
  readonly collector: FakeCollector;
}

async function settle(fixture: ComponentFixture<PayLinkPage>): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  fixture.detectChanges();
}

async function boot(gateway: FakeGateway, collector = new FakeCollector()): Promise<Booted> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PayLinkPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ jeton: TOKEN }) } },
      },
      { provide: PayLinkGateway, useValue: gateway },
      { provide: CardCollector, useValue: collector },
    ],
  });
  const fixture = TestBed.createComponent(PayLinkPage);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, gateway, collector };
}

function payButton(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>('[data-pay]');
}

async function clickPay(booted: Booted): Promise<void> {
  payButton(booted.el)?.click();
  await settle(booted.fixture);
}

describe('PayLinkPage', () => {
  it('lit le lien, demande l’intention et montre ce qu’il y a à payer', async () => {
    const { el, gateway, collector } = await boot(
      new FakeGateway([{ kind: 'ready', view: PAYABLE }]),
    );
    expect(gateway.calls).toEqual([`view:${TOKEN}`, `intent:${TOKEN}`]);
    expect(collector.mounted).toBe(1);
    const text = el.textContent ?? '';
    expect(text).toContain('123,45');
    expect(text).toContain('La Folie Douce');
    expect(text).toContain('Boulangerie Martin');
    expect(text).toContain('F-2026-0042');
    expect(el.querySelector('[data-due]')?.textContent).toContain('2026');
    expect(payButton(el)?.disabled).toBe(false);
  });

  it('n’affiche pas d’échéance quand il n’y en a pas', async () => {
    const { el } = await boot(
      new FakeGateway([{ kind: 'ready', view: { ...PAYABLE, dueOn: null } }]),
    );
    expect(el.querySelector('[data-due]')).toBeNull();
  });

  it('dit « pas ou plus valable » sur un 404, sans demander d’intention', async () => {
    const { el, gateway } = await boot(new FakeGateway([{ kind: 'not_found' }]));
    expect(el.querySelector('[data-not-found]')).not.toBeNull();
    expect(el.textContent).toContain(FR.notFoundTitle);
    expect(gateway.calls).toEqual([`view:${TOKEN}`]);
  });

  it('dit un lien déjà réglé', async () => {
    const { el } = await boot(
      new FakeGateway([{ kind: 'ready', view: { payable: false, reason: 'settled' } }]),
    );
    expect(el.querySelector('[data-settled]')).not.toBeNull();
    expect(payButton(el)).toBeNull();
  });

  it('dit un paiement annulé', async () => {
    const { el } = await boot(
      new FakeGateway([{ kind: 'ready', view: { payable: false, reason: 'cancelled' } }]),
    );
    expect(el.querySelector('[data-cancelled]')).not.toBeNull();
  });

  it('une panne à la lecture est « indisponible », jamais « invalide », et se recharge', async () => {
    const gateway = new FakeGateway([{ kind: 'failed' }, { kind: 'ready', view: PAYABLE }]);
    const booted = await boot(gateway);
    expect(booted.el.querySelector('[data-unavailable]')).not.toBeNull();
    expect(booted.el.querySelector('[data-not-found]')).toBeNull();
    booted.el.querySelector<HTMLButtonElement>('[data-unavailable] button')?.click();
    await settle(booted.fixture);
    expect(payButton(booted.el)).not.toBeNull();
  });

  it('un 404 à la demande d’intention dit le lien non valable', async () => {
    const { el } = await boot(
      new FakeGateway([{ kind: 'ready', view: PAYABLE }], [{ kind: 'not_found' }]),
    );
    expect(el.querySelector('[data-not-found]')).not.toBeNull();
  });

  it('un 409 « non payable » relit la vue et dit pourquoi', async () => {
    const gateway = new FakeGateway(
      [
        { kind: 'ready', view: PAYABLE },
        { kind: 'ready', view: { payable: false, reason: 'settled' } },
      ],
      [{ kind: 'not_payable' }],
    );
    const { el } = await boot(gateway);
    expect(gateway.calls).toEqual([`view:${TOKEN}`, `intent:${TOKEN}`, `view:${TOKEN}`]);
    expect(el.querySelector('[data-settled]')).not.toBeNull();
  });

  it('un 409 « lien à refaire » le dit', async () => {
    const { el } = await boot(
      new FakeGateway([{ kind: 'ready', view: PAYABLE }], [{ kind: 'closed' }]),
    );
    expect(el.querySelector('[data-renew]')).not.toBeNull();
  });

  it('une panne à l’intention est « indisponible »', async () => {
    const { el } = await boot(
      new FakeGateway([{ kind: 'ready', view: PAYABLE }], [{ kind: 'failed' }]),
    );
    expect(el.querySelector('[data-unavailable]')).not.toBeNull();
  });

  it('un formulaire qui ne se monte pas est « indisponible »', async () => {
    const { el } = await boot(
      new FakeGateway([{ kind: 'ready', view: PAYABLE }]),
      new FakeCollector(false),
    );
    expect(el.querySelector('[data-unavailable]')).not.toBeNull();
  });

  it('un montage qui lève est « indisponible »', async () => {
    const { el } = await boot(
      new FakeGateway([{ kind: 'ready', view: PAYABLE }]),
      new FakeCollector('throws'),
    );
    expect(el.querySelector('[data-unavailable]')).not.toBeNull();
  });

  it('payé : dit que le paiement est reçu et que la confirmation suit', async () => {
    const booted = await boot(new FakeGateway([{ kind: 'ready', view: PAYABLE }]));
    await clickPay(booted);
    expect(booted.el.querySelector('[data-paid]')?.textContent).toContain(FR.paidTitle);
    expect(booted.el.querySelector('[role="status"]')?.textContent).toContain(FR.paidSubtitle);
    expect(payButton(booted.el)).toBeNull();
    expect(booted.collector.payerNames).toEqual([undefined]);
  });

  it('un refus garde la phrase du prestataire, relie l’erreur au bouton, et se réessaie', async () => {
    const collector = new FakeCollector();
    collector.outcomes.push({ kind: 'refused', message: 'Fonds insuffisants.' });
    const booted = await boot(new FakeGateway([{ kind: 'ready', view: PAYABLE }]), collector);
    await clickPay(booted);
    const error = booted.el.querySelector('[data-error]');
    expect(error?.textContent).toContain('Fonds insuffisants.');
    const button = payButton(booted.el);
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-describedby')).toBe(error?.id);
    await clickPay(booted);
    expect(booted.el.querySelector('[data-paid]')).not.toBeNull();
  });

  it('un refus sans phrase prend la nôtre', async () => {
    const collector = new FakeCollector();
    collector.outcomes.push({ kind: 'refused', message: null });
    const booted = await boot(new FakeGateway([{ kind: 'ready', view: PAYABLE }]), collector);
    await clickPay(booted);
    expect(booted.el.querySelector('[data-error]')?.textContent).toContain(FR.refused);
  });

  it('un paiement inachevé se dit et se réessaie', async () => {
    const collector = new FakeCollector();
    collector.outcomes.push({ kind: 'unfinished' });
    const booted = await boot(new FakeGateway([{ kind: 'ready', view: PAYABLE }]), collector);
    await clickPay(booted);
    expect(booted.el.querySelector('[data-error]')?.textContent).toContain(FR.unfinished);
    expect(payButton(booted.el)?.disabled).toBe(false);
  });

  it('une redirection ne change pas de phase', async () => {
    const collector = new FakeCollector();
    collector.outcomes.push({ kind: 'redirected' });
    const booted = await boot(new FakeGateway([{ kind: 'ready', view: PAYABLE }]), collector);
    await clickPay(booted);
    expect(booted.el.querySelector('[data-paid]')).toBeNull();
    expect(booted.el.querySelector('[data-error]')).toBeNull();
    expect(booted.el.querySelector('[role="status"]')?.textContent).toContain(FR.submitting);
  });
});
