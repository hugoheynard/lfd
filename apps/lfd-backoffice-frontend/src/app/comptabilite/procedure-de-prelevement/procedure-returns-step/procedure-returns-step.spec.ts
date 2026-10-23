import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  BatchCollectionReturnsView,
  CollectionProcedureReturnsView,
  CreatedIdResponse,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BankReturnChecksService } from '../../bank-return-checks.service';
import { CollectionReturnsService } from '../../collection-returns.service';
import { collectionBatch } from '../../__tests__/collection-batch-fixture';
import { procedureView } from '../../__tests__/collection-procedure-fixture';
import { ProcedureReturnsStep } from './procedure-returns-step';

/**
 * L'onglet « Retours » (Hugo, 2026-10-23) : la barre d'actions au-dessus
 * (importer, puis signaler à la main), les chiffres clés en tête, et
 * l'attestation « Retours contrôlés » — aujourd'hui, et les jours passés
 * restés sans contrôle, nommés.
 */

class FakeChecks {
  readonly attested: (string | null)[] = [];
  attest(_legalEntityId: string, day: string | null): Promise<CreatedIdResponse> {
    this.attested.push(day);
    return Promise.resolve({ id: 'chk' });
  }
}

class FakeReturns {
  ofBatch(): Promise<BatchCollectionReturnsView> {
    return Promise.resolve({ returns: [], reasons: [] });
  }
}

const TODAY = '2026-11-18';

function returnsView(over: Partial<CollectionProcedureReturnsView> = {}) {
  return {
    ...procedureView().returns,
    state: 'to_do' as const,
    reason: 'watching' as const,
    watchUntilDay: '2026-11-23',
    today: TODAY,
    figures: {
      lineCount: 12,
      pendingCount: 2,
      representedCount: 1,
      settledOtherwiseCount: 0,
      writtenOffCount: 1,
    },
    ...over,
  };
}

async function render(
  returns: CollectionProcedureReturnsView,
  canWrite = true,
): Promise<{ fixture: ComponentFixture<ProcedureReturnsStep>; checks: FakeChecks }> {
  const checks = new FakeChecks();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProcedureReturnsStep],
    providers: [
      { provide: BankReturnChecksService, useValue: checks },
      { provide: CollectionReturnsService, useValue: new FakeReturns() },
    ],
  });
  const fixture = TestBed.createComponent(ProcedureReturnsStep);
  fixture.componentRef.setInput('returns', returns);
  fixture.componentRef.setInput('legalEntityId', 'le1');
  fixture.componentRef.setInput('batch', collectionBatch({ status: 'deposited' }));
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, checks };
}

const host = (fixture: ComponentFixture<ProcedureReturnsStep>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('l’onglet « Retours » de la procédure', () => {
  it('la barre d’actions est au-dessus : importer, puis signaler à la main', async () => {
    const { fixture } = await render(returnsView());

    const bar = host(fixture).querySelector('[data-action-bar]');
    expect(bar?.querySelector('[data-import-returns]')?.textContent).toContain(
      'Importer le fichier de rejets de la banque',
    );
    expect(bar?.querySelector('[data-signal-by-hand]')?.textContent).toContain(
      'Signaler un retour à la main',
    );
    const order = [...host(fixture).querySelectorAll('[data-action-bar], app-bank-returns')];
    expect(order.map((element) => element.tagName.toLowerCase())).toEqual([
      'div',
      'app-bank-returns',
    ]);
  });

  it('le bloc des retours n’a plus son bouton d’import dans l’en-tête de section', async () => {
    const { fixture } = await render(returnsView());

    const section = host(fixture).querySelector('app-bank-returns');
    expect(section?.textContent).not.toContain('Importer un fichier de la banque');
  });

  it('en lecture seule : ni barre, ni attestation', async () => {
    const { fixture } = await render(returnsView(), false);

    expect(host(fixture).querySelector('[data-action-bar]')).toBeNull();
    expect(host(fixture).querySelector('[data-attest-today]')).toBeNull();
  });

  it('les chiffres clés : lignes, en attente de décision, et traités par décision', async () => {
    const { fixture } = await render(returnsView());

    const figure = (key: string): string =>
      host(fixture).querySelector(`[data-figure="${key}"]`)?.textContent ?? '';
    expect(figure('lines')).toContain('12');
    expect(figure('lines')).toContain('lignes du lot');
    expect(figure('pending')).toContain('2');
    expect(figure('pending')).toContain('en attente de décision');
    expect(figure('represented')).toContain('re-présentés');
    expect(figure('settled')).toContain('réglés autrement');
    expect(figure('written-off')).toContain('passés en perte');
  });

  it('« Retours contrôlés pour aujourd’hui » note le jour, sans jour donné', async () => {
    const { fixture, checks } = await render(returnsView());

    host(fixture).querySelector<HTMLButtonElement>('[data-attest-today]')?.click();
    await fixture.whenStable();

    expect(checks.attested).toEqual([null]);
  });

  it('aujourd’hui attesté : dit qui et quand, propose de retirer, plus de bouton du jour', async () => {
    const { fixture } = await render(
      returnsView({
        todayCheck: { day: TODAY, at: '2026-11-18T08:12:00.000Z', byName: 'Claire Compta' },
      }),
    );

    const check = host(fixture).querySelector('[data-today-check]')?.textContent ?? '';
    expect(check).toContain('Retours contrôlés pour aujourd’hui');
    expect(check).toContain('Claire Compta');
    expect(host(fixture).querySelector('[data-withdraw-check]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-attest-today]')).toBeNull();
  });

  it('nomme les jours passés sans contrôle, et chacun se rattrape', async () => {
    const { fixture, checks } = await render(
      returnsView({ missingCheckDays: ['2026-11-16', '2026-11-17', TODAY] }),
    );

    const missing = host(fixture).querySelector('[data-missing-days]')?.textContent ?? '';
    expect(missing).toContain('16 nov. 2026');
    expect(missing).toContain('17 nov. 2026');
    expect(host(fixture).querySelector(`[data-attest-day="${TODAY}"]`)).toBeNull();
    host(fixture).querySelector<HTMLButtonElement>('[data-attest-day="2026-11-16"]')?.click();
    await fixture.whenStable();

    expect(checks.attested).toEqual(['2026-11-16']);
  });

  it('fenêtre close avec un trou : la phrase le dit, sans le lisser en « fait »', async () => {
    const { fixture } = await render(
      returnsView({ reason: 'unchecked_days', missingCheckDays: ['2026-11-19'] }),
    );

    expect(host(fixture).querySelector('[data-returns-sentence]')?.textContent).toContain(
      'un trou ne vaut pas « aucun impayé »',
    );
  });
});
