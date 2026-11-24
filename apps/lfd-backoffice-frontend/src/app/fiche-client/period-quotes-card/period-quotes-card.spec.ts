import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CompanyPeriodQuoteView,
  CompanyPeriodQuotesView,
  StaffPermission,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { PeriodQuotesService } from '../../comptabilite/period-quotes.service';
import { NotifyService } from '../../notify.service';
import { PeriodQuotesCard, quoteRow, replacedSentence } from './period-quotes-card';

/** Des instants seulement affichés : aucun n'est comparé à l'horloge. */
const AWAITING: CompanyPeriodQuoteView = {
  quoteId: 'pq_2',
  number: 'D-20261031-1',
  version: 2,
  state: 'awaiting',
  periodStartsAt: '2026-09-30T22:00:00.000Z',
  periodClosesAt: '2026-10-31T23:00:00.000Z',
  serviceCode: 'SRV-01',
  totalCents: 12_000,
  orderCount: 2,
  createdAt: '2026-11-02T08:00:00.000Z',
  replaced: { totalCents: 10_000, gapCents: 2_000 },
  invoice: null,
};

const INVOICED: CompanyPeriodQuoteView = {
  ...AWAITING,
  quoteId: 'pq_9',
  number: 'D-20260930-1',
  version: 1,
  state: 'invoiced',
  replaced: null,
  invoice: { invoiceId: 'inv_9', number: 'FA-LFD-2026-000009' },
};

function viewOf(
  quotes: readonly CompanyPeriodQuoteView[],
  payerCompanyId = 'co_army',
): CompanyPeriodQuotesView {
  return { payerCompanyId, payerName: 'Caserne des Alpes', quotes };
}

interface Api {
  readonly resent: { quoteId: string; key: string }[];
  views: CompanyPeriodQuotesView[];
  resendRefusal: unknown;
}

async function boot(
  api: Api,
  permissions: readonly StaffPermission[],
  options: {
    readonly companyId?: string;
    readonly panelResult?: unknown;
    readonly errors?: unknown[];
  } = {},
): Promise<ComponentFixture<PeriodQuotesCard>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PeriodQuotesService,
        useValue: {
          ofCompany: () => Promise.resolve(api.views.length > 1 ? api.views.shift() : api.views[0]),
          resend: (quoteId: string, key: string) => {
            api.resent.push({ quoteId, key });
            return api.resendRefusal === null
              ? Promise.resolve({ quoteId })
              : Promise.reject(api.resendRefusal);
          },
          document: () => Promise.resolve(new Blob()),
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      {
        provide: NotifyService,
        useValue: {
          success: () => undefined,
          error: (error: unknown) => options.errors?.push(error),
        },
      },
      {
        provide: FoldPanelHostService,
        useValue: { open: () => ({ closed: Promise.resolve(options.panelResult) }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PeriodQuotesCard);
  fixture.componentRef.setInput('companyId', options.companyId ?? 'co_army');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const root = (fixture: ComponentFixture<PeriodQuotesCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function api(views: CompanyPeriodQuotesView[], resendRefusal: unknown = null): Api {
  return { resent: [], views, resendRefusal };
}

describe('les mots d’une version', () => {
  it('dit l’écart lu sur le serveur, signé', () => {
    expect(replacedSentence(AWAITING)?.replace(/\s/gu, ' ')).toBe(
      'Remplace la version 1 (100,00 €) : écart +20,00 €',
    );
  });

  it('tait l’écart d’une première version', () => {
    expect(replacedSentence(INVOICED)).toBeNull();
  });

  it('nomme l’état et le code service', () => {
    const row = quoteRow(AWAITING);
    expect(row.stateLabel).toBe('En attente de l’engagement');
    expect(row.meta).toContain('2 commandes');
    expect(row.meta).toContain('service SRV-01');
  });
});

describe('PeriodQuotesCard', () => {
  it('liste les versions, l’écart et la facture, avec les gestes pour qui écrit', async () => {
    const fixture = await boot(api([viewOf([AWAITING, INVOICED])]), ['b2b_accounting:write']);

    const text = root(fixture).textContent ?? '';
    expect(text).toContain('D-20261031-1 · version 2');
    expect(text).toContain('FA-LFD-2026-000009');
    expect(root(fixture).querySelector('[data-period-quote-replaced]')).not.toBeNull();
    expect(root(fixture).querySelectorAll('[data-period-quote-resend]')).toHaveLength(1);
    expect(root(fixture).querySelectorAll('[data-period-quote-commitment]')).toHaveLength(1);
  });

  it('sans écriture comptable, la liste et le PDF, sans les gestes', async () => {
    const fixture = await boot(api([viewOf([AWAITING])]), ['b2b_accounting:read']);

    expect(root(fixture).querySelector('[data-period-quote-pdf]')).not.toBeNull();
    expect(root(fixture).querySelector('[data-period-quote-resend]')).toBeNull();
  });

  it('muette sans devis', async () => {
    const fixture = await boot(api([viewOf([])]), ['b2b_accounting:write']);

    expect(root(fixture).querySelector('[data-period-quotes]')).toBeNull();
  });

  it('sur la fiche d’un site, nomme le payeur dont ce sont les devis', async () => {
    const fixture = await boot(api([viewOf([AWAITING])]), ['b2b_accounting:read'], {
      companyId: 'co_site',
    });

    expect(root(fixture).querySelector('[data-period-quotes-payer]')?.textContent).toContain(
      'Caserne des Alpes',
    );
  });

  it('renvoie sous la même clé tant que le geste a échoué, puis une clé neuve', async () => {
    const calls = api([viewOf([AWAITING])], new Error('refus'));
    const errors: unknown[] = [];
    const fixture = await boot(calls, ['b2b_accounting:write'], { errors });
    const button = (): HTMLButtonElement | null =>
      root(fixture).querySelector('[data-period-quote-resend]');

    button()?.click();
    await fixture.whenStable();
    button()?.click();
    await fixture.whenStable();
    calls.resendRefusal = null;
    button()?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    button()?.click();
    await fixture.whenStable();

    const keys = calls.resent.map((call) => call.key);
    expect(errors).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[2]);
  });

  it('après « Engagement reçu », nomme la facture émise avec son lien', async () => {
    const fixture = await boot(
      api([
        viewOf([AWAITING]),
        viewOf([{ ...AWAITING, state: 'invoiced', invoice: INVOICED.invoice }]),
      ]),
      ['b2b_accounting:write'],
      { panelResult: { invoiceId: 'inv_9' } },
    );

    root(fixture).querySelector<HTMLButtonElement>('[data-period-quote-commitment]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const notice = root(fixture).querySelector('[data-period-quote-issued]');
    expect(notice?.textContent).toContain('FA-LFD-2026-000009');
    expect(notice?.querySelector('a')?.getAttribute('href')).toBe('/comptabilite/factures/inv_9');
  });
});
