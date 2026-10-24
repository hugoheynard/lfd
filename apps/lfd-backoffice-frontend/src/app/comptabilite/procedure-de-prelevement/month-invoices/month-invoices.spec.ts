import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { MonthlyClosureView } from '@lfd/contracts';

import { MonthInvoices, autopilotSentence } from './month-invoices';

/**
 * Ce que ces cas tiennent (plan `facture-emise.md`) : la
 * carte nomme le mois, liste ses factures et ses payeurs signalés, dit
 * pourquoi elle est vide, et n'offre le bouton qu'à qui peut écrire, sur un
 * mois en service. Les dates ne sont comparées qu'entre elles.
 */

const VIEW: MonthlyClosureView = {
  periodClosesAt: '2026-09-30T22:00:00.000Z',
  periodStartsAt: '2026-08-31T22:00:00.000Z',
  periodLabel: 'du 1er au 30 septembre 2026',
  modes: ['monthly'],
  issuableFrom: '2026-09-30T21:55:00.000Z',
  reached: true,
  floorAt: '2026-09-01T00:00:00.000Z',
  open: true,
  invoices: [
    {
      invoiceId: 'inv1',
      number: 'FA-LFD-2026-000001',
      payerCompanyId: 'c1',
      payerName: 'Boulangerie du Port',
      issuedOn: '2026-09-30',
      dueOn: '2026-10-15',
      totalCents: 10_550,
      orderCount: 2,
      mandateReference: null,
      unbillableOrders: ['CMD-9'],
    },
  ],
  signaled: [],
  autopilotRun: null,
  batches: [],
};

async function render(
  view: MonthlyClosureView | null,
  options: { readonly error?: string } = {},
): Promise<{ host: HTMLElement }> {
  TestBed.configureTestingModule({ imports: [MonthInvoices] });
  const fixture = TestBed.createComponent(MonthInvoices);
  fixture.componentRef.setInput('view', view);
  if (options.error !== undefined) {
    fixture.componentRef.setInput('error', options.error);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  return { host: fixture.nativeElement as HTMLElement };
}

describe('MonthInvoices', () => {
  it('nomme le mois, liste ses factures, et dit qu’aucun mandat n’a été figé', async () => {
    const { host } = await render(VIEW);

    expect(host.textContent).toContain('Les factures du 1er au 30 septembre 2026');
    const table = host.querySelector('[data-invoices-table]')?.textContent ?? '';
    expect(table).toContain('FA-LFD-2026-000001');
    expect(table).toMatch(/105,50\s€/u);
    expect(table).toContain('—');
    expect(host.querySelector('[data-invoice-unbillable]')?.textContent).toContain('CMD-9');
  });

  it('un mois d’avant la mise en service le dit', async () => {
    const { host } = await render({ ...VIEW, open: false, invoices: [] });

    expect(host.querySelector('[data-invoices-not-open]')?.textContent).toContain(
      'gardent l’arrêté de facturation',
    );
  });

  it('rien d’émis ni de signalé : dit quand elles partent', async () => {
    const { host } = await render({ ...VIEW, invoices: [] });

    expect(host.querySelector('[data-invoices-empty]')?.textContent).toContain('23h55');
  });

  it('un payeur signalé se voit, avec le geste de sortie', async () => {
    const { host } = await render({
      ...VIEW,
      signaled: [
        {
          payerCompanyId: 'c2',
          payerName: 'Chalet',
          mandateReference: null,
          message: 'Le client « Chalet » n’a pas de SIREN.',
          unbillableOrders: [],
          recordedAt: '2026-09-30T20:05:00.000Z',
        },
      ],
    });

    expect(host.querySelector('[data-invoices-signaled]')?.textContent).toContain(
      'Émettre les factures des réceptions confirmées',
    );
    expect(host.querySelector('[data-signaled-table]')?.textContent).toContain('pas de SIREN');
  });

  it('un payeur signalé sur deux mandats a deux lignes, chacune avec sa RUM (E4b)', async () => {
    const signal = {
      payerCompanyId: 'c2',
      payerName: 'Chalet',
      message: 'Le client « Chalet » n’a pas de SIREN.',
      unbillableOrders: [],
      recordedAt: '2026-09-30T21:56:00.000Z',
    };
    const { host } = await render({
      ...VIEW,
      signaled: [
        { ...signal, mandateReference: 'RUM-CHALET' },
        { ...signal, mandateReference: 'RUM-PRINCIPAL' },
      ],
    });

    const table = host.querySelector('[data-signaled-table]')?.textContent ?? '';
    expect(table).toContain('RUM-CHALET');
    expect(table).toContain('RUM-PRINCIPAL');
    expect(host.querySelector('[data-invoices-signaled]')?.textContent).toContain(
      '2 facture(s) signalée(s)',
    );
  });

  it('rythmes mêlés : le titre dit les modes qui closent ici (M4c)', async () => {
    const { host } = await render({ ...VIEW, modes: ['monthly', 'weekly'] });

    expect(host.textContent).toContain(
      'Les factures du 1er au 30 septembre 2026 — clients hebdomadaires et mensuels',
    );
  });

  it('nomme les lots de la clôture, et en dit l’absence (M4c)', async () => {
    const withBatch = await render({
      ...VIEW,
      batches: [
        {
          batchId: 'b1',
          scheme: 'B2B',
          status: 'deposited',
          periodLabel: 'du 1er au 30 septembre 2026',
          lineCount: 2,
          totalCents: 21_100,
        },
      ],
    });
    expect(withBatch.host.querySelector('[data-closure-batch]')?.textContent).toMatch(
      /Lot du 1er au 30 septembre 2026 — B2B : déposé, 2 ligne\(s\), 211,00\s€/u,
    );
    TestBed.resetTestingModule();

    const upcoming = await render({ ...VIEW, reached: false, invoices: [] });
    expect(upcoming.host.querySelector('[data-closure-no-batch]')?.textContent).toContain(
      'Le lot se prépare après la clôture du 1er octobre 2026.',
    );
  });

  it('une lecture en échec ne montre que son message', async () => {
    const { host } = await render(null, { error: 'illisible' });

    expect(host.querySelector('[data-invoices-error]')?.textContent).toContain('illisible');
  });
});

describe('lateSentence', () => {
  it('dit « émise en retard » quand le jour d’émission dépasse le mois facturé', async () => {
    const { host } = await render({
      ...VIEW,
      invoices: [{ ...VIEW.invoices[0]!, issuedOn: '2026-10-02' }],
    });

    expect(host.querySelector('[data-invoice-late]')?.textContent).toContain(
      'Émise en retard, le 2 oct. 2026',
    );
  });

  it('se tait pour une facture du dernier jour', async () => {
    const { host } = await render(VIEW);

    expect(host.querySelector('[data-invoice-late]')).toBeNull();
  });
});

describe('autopilotSentence', () => {
  it('dit l’issue de la tentative automatique, et le geste quand elle a échoué', () => {
    const run = {
      periodClosesAt: '2026-09-30T22:00:00.000Z',
      ranAt: '2026-09-30T20:15:00.000Z',
      message: null,
    };
    expect(autopilotSentence({ ...run, outcome: 'issued' })).toContain('émises automatiquement');
    expect(autopilotSentence({ ...run, outcome: 'failed', message: 'boum' })).toContain(
      'Le bouton la reprend',
    );
  });
});
