import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { MonthlyInvoicesView } from '@lfd/contracts';

import { MonthInvoices, autopilotSentence } from './month-invoices';

/**
 * Ce que ces cas tiennent (plan `plan-emission-de-la-facture.md`, E4) : la
 * carte nomme le mois, liste ses factures et ses payeurs signalés, dit
 * pourquoi elle est vide, et n'offre le bouton qu'à qui peut écrire, sur un
 * mois en service. Les dates ne sont comparées qu'entre elles.
 */

const VIEW: MonthlyInvoicesView = {
  month: '2026-09',
  issuableFrom: '2026-09-30T20:00:00.000Z',
  floorAt: '2026-09-01T00:00:00.000Z',
  open: true,
  invoices: [
    {
      invoiceId: 'inv1',
      number: 'FA-2026-000001',
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
};

async function render(
  view: MonthlyInvoicesView | null,
  options: { readonly canWrite?: boolean; readonly error?: string } = {},
): Promise<{ host: HTMLElement; issued: string[] }> {
  TestBed.configureTestingModule({ imports: [MonthInvoices] });
  const fixture = TestBed.createComponent(MonthInvoices);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('canWrite', options.canWrite ?? true);
  if (options.error !== undefined) {
    fixture.componentRef.setInput('error', options.error);
  }
  const issued: string[] = [];
  fixture.componentInstance.issue.subscribe((month) => issued.push(month));
  fixture.detectChanges();
  await fixture.whenStable();
  return { host: fixture.nativeElement as HTMLElement, issued };
}

describe('MonthInvoices', () => {
  it('nomme le mois, liste ses factures, et dit qu’aucun mandat n’a été figé', async () => {
    const { host } = await render(VIEW);

    expect(host.textContent).toContain('Les factures de septembre');
    const table = host.querySelector('[data-invoices-table]')?.textContent ?? '';
    expect(table).toContain('FA-2026-000001');
    expect(table).toMatch(/105,50\s€/u);
    expect(table).toContain('—');
    expect(host.querySelector('[data-invoice-unbillable]')?.textContent).toContain('CMD-9');
  });

  it('le bouton émet le mois de la vue', async () => {
    const { host, issued } = await render(VIEW);

    host.querySelector<HTMLButtonElement>('[data-issue-invoices]')?.click();

    expect(issued).toEqual(['2026-09']);
  });

  it('un mois d’avant la mise en service le dit, sans bouton', async () => {
    const { host } = await render({ ...VIEW, open: false, invoices: [] });

    expect(host.querySelector('[data-invoices-not-open]')?.textContent).toContain(
      'gardent l’arrêté de facturation',
    );
    expect(host.querySelector('[data-issue-invoices]')).toBeNull();
  });

  it('rien d’émis ni de signalé : dit quand elles partent', async () => {
    const { host } = await render({ ...VIEW, invoices: [] });

    expect(host.querySelector('[data-invoices-empty]')?.textContent).toContain('22h');
  });

  it('un payeur signalé se voit, avec le geste de sortie', async () => {
    const { host } = await render({
      ...VIEW,
      signaled: [
        {
          payerCompanyId: 'c2',
          payerName: 'Chalet',
          message: 'Le client « Chalet » n’a pas de SIREN.',
          unbillableOrders: [],
          recordedAt: '2026-09-30T20:05:00.000Z',
        },
      ],
    });

    expect(host.querySelector('[data-invoices-signaled]')?.textContent).toContain(
      'Émettre les factures de septembre',
    );
    expect(host.querySelector('[data-signaled-table]')?.textContent).toContain('pas de SIREN');
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
    const run = { month: '2026-09', ranAt: '2026-09-30T20:15:00.000Z', message: null };
    expect(autopilotSentence({ ...run, outcome: 'issued' })).toContain('émises automatiquement');
    expect(autopilotSentence({ ...run, outcome: 'failed', message: 'boum' })).toContain(
      'Le bouton la reprend',
    );
  });
});
