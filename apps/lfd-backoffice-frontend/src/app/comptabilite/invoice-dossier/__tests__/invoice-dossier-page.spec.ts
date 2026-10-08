import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { InvoiceDossierView } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CycleStatementService } from '../../../fiche-client/facturation/cycle-statement.service';
import { NotifyService } from '../../../notify.service';
import { DirectDebitBlocksService } from '../../direct-debit-blocks.service';
import { dossier } from '../../__tests__/invoice-dossier-fixture';
import { InvoiceDossierService } from '../../invoice-dossier.service';
import { InvoiceDossierPage, stateOfFailure } from '../invoice-dossier-page';

const CYCLES = {
  cycles: [
    { month: '2026-10', startsAt: '', closesAt: '', inProgress: true },
    { month: '2026-09', startsAt: '', closesAt: '', inProgress: false },
  ],
};

async function mount(answer: InvoiceDossierView | HttpErrorResponse): Promise<{
  readonly page: InvoiceDossierPage;
  readonly read: ReturnType<typeof vi.fn>;
}> {
  const read = vi.fn(async () => {
    if (answer instanceof HttpErrorResponse) {
      throw answer;
    }
    return answer;
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: InvoiceDossierService, useValue: { dossier: read, exportCsv: vi.fn() } },
      { provide: CycleStatementService, useValue: { cycles: async () => CYCLES } },
      {
        provide: DirectDebitBlocksService,
        useValue: {
          list: async () => [
            {
              companyId: 'c1',
              reference: 'C-1',
              raisonSociale: 'SARL Port',
              enseigne: '',
              block: null,
            },
          ],
        },
      },
      { provide: NotifyService, useValue: { error: () => undefined } },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new InvoiceDossierPage());
  await TestBed.runInInjectionContext(() => page['loadChoices']());
  return { page, read };
}

function httpError(status: number, message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code: 'x', message } });
}

describe("l'écran du dossier de facturation", () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('attend une société, et propose le cycle le plus récent', async () => {
    const { page, read } = await mount(dossier());

    expect(page['state']()).toBe('idle');
    expect(page['month']()).toBe('2026-10');
    expect(page['cycleChoices']()[0]?.label).toBe('octobre 2026 — en cours, non clos');
    // Sans enseigne, la raison sociale nomme la société.
    expect(page['companyChoices']()[0]?.label).toBe('SARL Port — C-1');
    expect(read).not.toHaveBeenCalled();
  });

  it('calcule le dossier de la société choisie, pour le cycle choisi', async () => {
    const { page, read } = await mount(dossier());

    page['onCompany']('c1');
    await vi.waitFor(() => expect(page['state']()).toBe('ready'));
    page['onMonth']('2026-09');
    await vi.waitFor(() => expect(read).toHaveBeenLastCalledWith('c1', '2026-09'));
    expect(page['dossier']()?.companyName).toBe('Café du Port');
  });

  it('affiche tel quel le message du 409, qui nomme le bon', async () => {
    const message = 'Le bon CMD-7 porte une surtaxe sans taux de TVA.';
    const { page } = await mount(httpError(409, message));

    page['onCompany']('c1');
    await vi.waitFor(() => expect(page['state']()).toBe('conflict'));
    expect(page['conflict']()).toBe(message);
    expect(page['dossier']()).toBeNull();
  });

  it('range 404, 409 et le reste dans trois états distincts', () => {
    expect(stateOfFailure(httpError(404, 'introuvable'))).toBe('not-found');
    expect(stateOfFailure(httpError(409, 'bon'))).toBe('conflict');
    expect(stateOfFailure(httpError(500, 'panne'))).toBe('error');
    expect(stateOfFailure(new Error('réseau'))).toBe('error');
  });
});
