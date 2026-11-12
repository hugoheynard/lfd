import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { RecordBankTransferPayload, UnpaidTransferInvoiceView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { BankTransfersService } from '../bank-transfers.service';
import { BankTransferPanel } from './bank-transfer-panel';

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

describe('BankTransferPanel', () => {
  it('envoie le virement à l’entité des factures cochées, avec une clé d’intention, puis ferme', async () => {
    const sent: { entity: string; payload: RecordBankTransferPayload; key: string }[] = [];
    let closedWith: unknown = 'open';
    TestBed.configureTestingModule({
      imports: [BankTransferPanel],
      providers: [
        {
          provide: BankTransfersService,
          useValue: {
            record: (entity: string, payload: RecordBankTransferPayload, key: string) => {
              sent.push({ entity, payload, key });
              return Promise.resolve({ transferId: 'vir_1' });
            },
          },
        },
        { provide: FoldPanelRef, useValue: { close: (value?: unknown) => (closedWith = value) } },
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

    const submit = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.includes('Enregistrer le virement'));
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
    expect(closedWith).toBe(true);
  });
});
