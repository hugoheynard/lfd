import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SubscriptionView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientSubscriptions } from '../../client-subscriptions.service';
import { recurringBasketsCopy } from '../../copy/screens/recurring-baskets.copy';
import { matchMediaAt } from '../../mon-compte/account.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { BASKET, TODAY } from '../basket.fixture';
import { BasketCard } from './basket-card';

const COPY = recurringBasketsCopy('fr');

interface Wire {
  calls: string[];
  answer: string | null;
  opened: unknown[];
}

let wire: Wire;
let fixture: ComponentFixture<BasketCard>;
const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

function render(basket: SubscriptionView = BASKET): void {
  wire = { calls: [], answer: null, opened: [] };
  const answer = (call: string): Promise<string | null> => {
    wire.calls.push(call);
    return Promise.resolve(wire.answer);
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BasketCard],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ClientSubscriptions,
        useValue: {
          setStatus: (id: string, status: string) => answer(`status:${id}:${status}`),
          stop: (id: string) => answer(`stop:${id}`),
          skip: (id: string, day: string) => answer(`skip:${id}:${day}`),
          restore: (id: string, day: string) => answer(`restore:${id}:${day}`),
        },
      },
      {
        provide: ShopCatalogue,
        useValue: {
          itemOf: (sku: string) => (sku === 'PAIN-01' ? { name: 'Pain de campagne' } : null),
        },
      },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_cmp: unknown, config: unknown) => {
            wire.opened.push(config);
            return { closed: Promise.resolve(true) };
          },
        },
      },
    ],
  });
  fixture = TestBed.createComponent(BasketCard);
  fixture.componentRef.setInput('basket', basket);
  fixture.componentRef.setInput('today', TODAY);
  fixture.detectChanges();
}

async function click(selector: string): Promise<void> {
  const button = el().querySelector<HTMLElement>(selector);
  expect(button).not.toBeNull();
  button?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('BasketCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dit le rythme, l’état en toutes lettres, le créneau et les lignes nommées', () => {
    render();

    expect(el().textContent).toContain(COPY.recurrence.weekly);
    expect(el().querySelector('[data-basket-status]')?.textContent).toContain(COPY.statusActive);
    expect(el().querySelector('[data-basket-routing]')?.textContent).toContain(COPY.pickup);
    expect(el().querySelector('[data-basket-routing]')?.textContent).toContain('7\u00a0h');
    expect(el().textContent).toContain('4 × Pain de campagne');
    // Un article que le catalogue ne connaît pas garde son SKU.
    expect(el().textContent).toContain('12 × CROI-02');
  });

  it('range les échéances : à venir, passées, et tait les annulées', () => {
    render();

    const days = Array.from(el().querySelectorAll('[data-occurrence]')).map((li) =>
      li.getAttribute('data-occurrence'),
    );
    expect(days).toEqual(['2026-12-17', '2026-12-24', '2026-12-31', '2026-11-26', '2026-12-03']);
    expect(el().querySelector('[data-occurrence="2026-12-04"]')).toBeNull();
  });

  it('une échéance manquée dit « nous vous contactons », sans cause ni geste', () => {
    render();

    const missed = el().querySelector('[data-occurrence="2026-12-03"]');
    expect(missed?.querySelector('[data-not-placed]')?.textContent).toContain(COPY.notPlaced);
    expect(missed?.querySelectorAll('button').length).toBe(0);
  });

  it('une échéance passée mène à sa commande', () => {
    render();

    const link = el().querySelector<HTMLAnchorElement>(
      '[data-occurrence="2026-11-26"] [data-view-order]',
    );
    expect(link?.getAttribute('href')).toBe('/mes-commandes/ord_past');
    expect(link?.getAttribute('aria-label')).toContain('jeudi 26 novembre');
  });

  it('offre Sauter à une prévue, Rétablir à une sautée ou modifiée', () => {
    render();

    const planned = el().querySelector('[data-occurrence="2026-12-17"]');
    expect(planned?.querySelector('[data-skip]')).not.toBeNull();
    expect(planned?.querySelector('[data-restore]')).toBeNull();
    const skipped = el().querySelector('[data-occurrence="2026-12-24"]');
    expect(skipped?.querySelector('[data-skip]')).toBeNull();
    expect(skipped?.querySelector('[data-restore]')).not.toBeNull();
    const changed = el().querySelector('[data-occurrence="2026-12-31"]');
    expect(changed?.textContent).toContain(COPY.overridden);
    expect(changed?.querySelector('[data-restore]')).not.toBeNull();
  });

  it('saute une échéance et l’annonce', async () => {
    render();

    await click('[data-occurrence="2026-12-17"] [data-skip]');

    expect(wire.calls).toEqual(['skip:sub_1:2026-12-17']);
    expect(el().querySelector('[data-basket-done]')?.textContent).toContain(COPY.announceSkipped);
  });

  it('un refus reste affiché dans la carte, avec la phrase du serveur', async () => {
    render();
    wire.answer = 'Échéance introuvable.';

    await click('[data-occurrence="2026-12-24"] [data-restore]');

    expect(el().querySelector('[data-basket-refusal]')?.textContent).toContain(
      'Échéance introuvable.',
    );
  });

  it('met en pause un panier actif, reprend un panier en pause', async () => {
    render();
    await click('[data-basket-toggle]');
    expect(wire.calls).toEqual(['status:sub_1:paused']);

    render({ ...BASKET, status: 'paused' });
    expect(el().querySelector('[data-basket-paused]')).not.toBeNull();
    await click('[data-basket-toggle]');
    expect(wire.calls).toEqual(['status:sub_1:active']);
  });

  it('n’arrête le panier qu’après confirmation', async () => {
    render();

    await click('[data-basket-stop]');
    expect(wire.calls).toEqual([]);
    const confirm = Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === COPY.stopConfirm,
    );
    expect(confirm).toBeDefined();
    confirm?.click();
    await fixture.whenStable();

    expect(wire.calls).toEqual(['stop:sub_1']);
  });

  it('annonce de nouvelles CGV avec leur date et un lien vers le bon texte', () => {
    render({ ...BASKET, nextSalesTerms: { revision: 4, effectiveOn: '2027-01-09' } });

    const notice = el().querySelector('[data-basket-new-terms]');
    expect(notice?.textContent).toContain(
      'Nouvelles conditions générales à partir du samedi 9 janvier.',
    );
    expect(notice?.querySelector('a')?.getAttribute('href')).toBe('/cgv?pour=pro');
  });

  it('modifier ouvre le dialogue de l’échéance et annonce le succès', async () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    render();

    await click('[data-occurrence="2026-12-17"] [data-modify]');

    expect(wire.opened).toHaveLength(1);
    expect(el().querySelector('[data-basket-done]')?.textContent).toContain(COPY.announceModified);
  });
});
