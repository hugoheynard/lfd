import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  BankTransferPreviewView,
  RecordBankTransferPayload,
  UnpaidTransferInvoiceView,
} from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { BankTransfersService } from '../bank-transfers.service';
import { BankTransferPanel, gapNoticeOf } from './bank-transfer-panel';

/** Des jours seulement affichés : aucun n'est comparé à l'horloge. */
const invoice = (over: Partial<UnpaidTransferInvoiceView> = {}): UnpaidTransferInvoiceView => ({
  invoiceId: 'inv_1',
  number: 'FA-LFD-2026-000001',
  legalEntityId: 'le_1',
  legalEntityName: 'La Folie Douce',
  payerCompanyId: 'co_1',
  payerName: 'Le Bistrot',
  issuedOn: '2026-10-31',
  dueOn: '2026-11-14',
  amountCents: 12_000,
  overdue: true,
  daysLate: 6,
  ...over,
});

interface Sent {
  readonly entity: string;
  readonly payload: RecordBankTransferPayload;
  readonly key: string;
}

/** Le panneau, son double d'API (l'aperçu rend l'écart donné), les saisies faites. */
async function filledPanel(gapCents: number) {
  const sent: Sent[] = [];
  const previews: { entity: string; amountCents: number; invoiceIds: readonly string[] }[] = [];
  const closed: { value: unknown } = { value: 'open' };
  TestBed.configureTestingModule({
    imports: [BankTransferPanel],
    providers: [
      {
        provide: BankTransfersService,
        useValue: {
          preview: (
            entity: string,
            amountCents: number,
            invoiceIds: readonly string[],
          ): Promise<BankTransferPreviewView> => {
            previews.push({ entity, amountCents, invoiceIds });
            return Promise.resolve({ amountCents, invoicesDueCents: 12_000, gapCents });
          },
          record: (entity: string, payload: RecordBankTransferPayload, key: string) => {
            sent.push({ entity, payload, key });
            return Promise.resolve({ transferId: 'vir_1' });
          },
        },
      },
      { provide: FoldPanelRef, useValue: { close: (value?: unknown) => (closed.value = value) } },
    ],
  });
  const fixture = TestBed.createComponent(BankTransferPanel);
  fixture.componentRef.setInput('data', {
    payerName: 'Le Bistrot',
    invoices: [invoice(), invoice({ invoiceId: 'inv_2', number: 'FA-LFD-2026-000002' })],
  });
  fixture.detectChanges();

  const inputs = fixture.debugElement.queryAll(By.css('fold-input'));
  inputs[0]?.componentInstance.value.set('120,00');
  inputs[1]?.componentInstance.value.set('VIR LE BISTROT');
  fixture.debugElement.query(By.css('fold-date')).componentInstance.value.set('2026-11-18');
  fixture.debugElement
    .queryAll(By.css('fold-checkbox'))[0]
    ?.triggerEventHandler('checkedChange', true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const submit = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ).find((button) => button.textContent?.includes('Enregistrer le virement'));
  return { fixture, sent, previews, closed, submit };
}

describe('BankTransferPanel', () => {
  it('à écart nul, envoie le virement à l’entité des factures cochées, avec une clé d’intention, puis ferme', async () => {
    const { fixture, sent, previews, closed, submit } = await filledPanel(0);

    expect(previews.at(-1)).toEqual({ entity: 'le_1', amountCents: 12_000, invoiceIds: ['inv_1'] });
    expect(submit?.disabled).toBe(false);
    submit?.click();
    await fixture.whenStable();

    expect(sent).toEqual([
      {
        entity: 'le_1',
        payload: {
          amountCents: 12_000,
          receivedOn: '2026-11-18',
          reference: 'VIR LE BISTROT',
          invoiceIds: ['inv_1'],
        },
        key: expect.any(String),
      },
    ]);
    expect(closed.value).toBe(true);
  });

  it('affiche l’écart servi avant « Enregistrer », et garde le bouton fermé', async () => {
    const { fixture, sent, submit } = await filledPanel(-455);

    const gap = (fixture.nativeElement as HTMLElement).querySelector('[data-transfer-gap]');
    expect(gap?.textContent).toContain('manquants');
    expect(submit?.disabled).toBe(true);
    submit?.click();
    await fixture.whenStable();
    expect(sent).toEqual([]);
  });
});

describe('gapNoticeOf', () => {
  it('dit l’écart servi, en trop ou manquant, et l’égalité', () => {
    expect(gapNoticeOf({ amountCents: 12_100, invoicesDueCents: 12_000, gapCents: 100 })).toEqual({
      variant: 'warning',
      text: expect.stringMatching(/^Écart de 1,00\s€ en trop/u),
    });
    expect(
      gapNoticeOf({ amountCents: 11_900, invoicesDueCents: 12_000, gapCents: -100 }).text,
    ).toMatch(/1,00\s€ manquants/u);
    expect(
      gapNoticeOf({ amountCents: 12_000, invoicesDueCents: 12_000, gapCents: 0 }).variant,
    ).toBe('success');
  });
});
