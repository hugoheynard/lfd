import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CollectionTestDebtorView,
  CollectionTestDebtorsView,
  GenerateCollectionTestPayload,
} from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { CollectionTestsService } from '../../collection-tests.service';
import { GenerateTestPanel, defaultSequence, earliestCommonDay } from './generate-test-panel';

/**
 * Ce que ces cas tiennent : une ligne par établissement coché, avec son
 * montant et sa séquence (RCUR d'office) ; l'échéance commune est la plus
 * tardive des échéances au plus tôt ; le compte et le total se lisent avant
 * « Générer » ; jamais plus de `maxDebtorsPerFile` lignes ; un refus du
 * serveur s'affiche tel quel.
 */

function debtor(
  companyId: string,
  earliestCollectionDay: string,
  over: Partial<CollectionTestDebtorView> = {},
): CollectionTestDebtorView {
  return {
    companyId,
    companyName: `Folie Douce ${companyId}`,
    mandate: {
      reference: `RUM-${companyId}`,
      scheme: 'B2B',
      paymentType: 'recurrent',
      ibanLast4: '0143',
    },
    sequences: ['FRST', 'RCUR'],
    earliestCollectionDay,
    refusal: null,
    ...over,
  };
}

const C1 = debtor('c1', '2026-10-26');
const C2 = debtor('c2', '2026-10-28', { sequences: ['OOFF'] });
const C3 = debtor('c3', '2026-10-26');

const TOOL: CollectionTestDebtorsView = {
  maxAmountCents: 100,
  maxDebtorsPerFile: 2,
  defaultRemittance: 'ESSAI PRELEVEMENT',
  debtors: [C1, C2, C3],
};

class FakeApi {
  readonly sent: GenerateCollectionTestPayload[] = [];
  refusal: string | null = null;
  generate(payload: GenerateCollectionTestPayload): Promise<string> {
    this.sent.push(payload);
    return this.refusal === null
      ? Promise.resolve('f1')
      : Promise.reject(new HttpErrorResponse({ status: 409, error: { message: this.refusal } }));
  }
}

interface Mounted {
  readonly fixture: ComponentFixture<GenerateTestPanel>;
  readonly closed: unknown[];
}

function mount(api: FakeApi): Mounted {
  const closed: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: CollectionTestsService, useValue: api },
      { provide: FoldPanelRef, useValue: { close: (value: unknown) => closed.push(value) } },
    ],
  });
  const fixture = TestBed.createComponent(GenerateTestPanel);
  fixture.componentRef.setInput('data', { tool: TOOL });
  fixture.detectChanges();
  return { fixture, closed };
}

function panel(fixture: ComponentFixture<GenerateTestPanel>): {
  toggle(id: string, checked: boolean): void;
  amount(id: string, value: string): void;
} {
  const instance = fixture.componentInstance;
  const find = (id: string): CollectionTestDebtorView => {
    const found = TOOL.debtors.find((d) => d.companyId === id);
    if (found === undefined) throw new Error(id);
    return found;
  };
  return {
    toggle: (id, checked) => {
      instance['toggle'](find(id), checked);
      fixture.detectChanges();
    },
    amount: (id, value) => {
      instance['setAmount'](find(id), value);
      fixture.detectChanges();
    },
  };
}

const summary = (fixture: ComponentFixture<GenerateTestPanel>): string =>
  (fixture.nativeElement as HTMLElement)
    .querySelector('[data-summary]')
    ?.textContent?.replace(/\s+/g, ' ')
    .trim() ?? '';

describe('GenerateTestPanel', () => {
  it('n’offre rien à générer tant qu’aucune case n’est cochée', () => {
    const { fixture } = mount(new FakeApi());

    expect(summary(fixture)).toBe('Aucun établissement coché.');
    expect(fixture.componentInstance['canSubmit']()).toBe(false);
  });

  it('une case cochée ouvre son montant et sa séquence, RCUR d’office', () => {
    const { fixture } = mount(new FakeApi());
    panel(fixture).toggle('c1', true);

    expect(fixture.componentInstance['lines']().get('c1')).toEqual({
      amount: '1,00',
      sequence: 'RCUR',
    });
    expect(summary(fixture)).toBe('1 ligne.');
  });

  it('l’échéance commune remonte à la plus tardive des lignes cochées', () => {
    const { fixture } = mount(new FakeApi());
    expect(fixture.componentInstance['collectionDay']()).toBe('2026-10-26');

    panel(fixture).toggle('c2', true);

    expect(fixture.componentInstance['earliestDay']()).toBe('2026-10-28');
    expect(fixture.componentInstance['collectionDay']()).toBe('2026-10-28');
  });

  it('dit le nombre de lignes et le total, et bloque sur un montant illisible', () => {
    const { fixture } = mount(new FakeApi());
    const p = panel(fixture);
    p.toggle('c1', true);
    p.toggle('c2', true);
    p.amount('c2', '0,50');

    expect(summary(fixture)).toBe('2 lignes.');
    expect(fixture.componentInstance['canSubmit']()).toBe(true);

    p.amount('c2', 'abc');
    expect(summary(fixture)).toBe('2 lignes — un montant est à reprendre.');
    expect(fixture.componentInstance['canSubmit']()).toBe(false);
  });

  it('refuse une ligne de plus que maxDebtorsPerFile', () => {
    const { fixture } = mount(new FakeApi());
    const p = panel(fixture);
    p.toggle('c1', true);
    p.toggle('c2', true);
    p.toggle('c3', true);

    expect([...fixture.componentInstance['lines']().keys()]).toEqual(['c1', 'c2']);
    expect(fixture.componentInstance['isLocked'](C3)).toBe(true);
    expect(fixture.componentInstance['isLocked'](C1)).toBe(false);
  });

  it('envoie une ligne par case cochée, l’échéance et le libellé communs', async () => {
    const api = new FakeApi();
    const { fixture, closed } = mount(api);
    const p = panel(fixture);
    p.toggle('c1', true);
    p.toggle('c2', true);
    p.amount('c1', '0,10');

    await fixture.componentInstance['submit']();

    expect(api.sent).toEqual([
      {
        debtors: [
          { companyId: 'c1', amountCents: 10, sequence: 'RCUR' },
          { companyId: 'c2', amountCents: 100, sequence: 'OOFF' },
        ],
        requestedCollectionDay: '2026-10-28',
        remittance: null,
      },
    ]);
    expect(closed).toEqual(['f1']);
  });

  it('affiche le refus du serveur tel quel, sans fermer', async () => {
    const api = new FakeApi();
    api.refusal = 'Un envoi ne mélange pas les schémas CORE et B2B.';
    const { fixture, closed } = mount(api);
    panel(fixture).toggle('c1', true);

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(closed).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(api.refusal);
  });

  it('propose la seule séquence d’un mandat ponctuel', () => {
    expect(defaultSequence(['OOFF'])).toBe('OOFF');
    expect(defaultSequence([])).toBeNull();
  });

  it('l’échéance commune est la plus tardive des échéances au plus tôt', () => {
    expect(earliestCommonDay(TOOL.debtors)).toBe('2026-10-28');
    expect(earliestCommonDay([])).toBeNull();
  });
});
