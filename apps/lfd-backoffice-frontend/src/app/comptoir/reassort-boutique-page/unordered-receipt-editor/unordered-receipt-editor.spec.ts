import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ResupplyReceiptsService } from '../resupply-receipts.service';
import type { StockRow } from '../resupply-stock-rows';
import { FakeReceipts, TODAY } from '../resupply-stock.testing';
import { UnorderedReceiptEditor } from './unordered-receipt-editor';

/** Le reçu sans commande d'un article : saisi, corrigé, retiré ; un refus remonte. */
const ROW: StockRow = {
  sku: 'BAG',
  name: 'Baguette',
  categoryId: 'fam_bread',
  saleUnit: 'piece',
  stock: 0,
  state: 'ok',
  asap: 0,
  tomorrow: 0,
  unordered: 4,
};

function mount(receipts: FakeReceipts, row: StockRow = ROW) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UnorderedReceiptEditor],
    providers: [{ provide: ResupplyReceiptsService, useValue: receipts }],
  });
  const fixture = TestBed.createComponent(UnorderedReceiptEditor);
  fixture.componentRef.setInput('siteId', 'site_v');
  fixture.componentRef.setInput('day', TODAY);
  fixture.componentRef.setInput('row', row);
  fixture.detectChanges();
  const events: string[] = [];
  fixture.componentInstance.saved.subscribe(() => events.push('saved'));
  fixture.componentInstance.failure.subscribe((failure) =>
    events.push(`failure ${failure ?? '-'}`),
  );
  return { editor: fixture.componentInstance, events };
}

describe('UnorderedReceiptEditor', () => {
  it('part du reçu enregistré, et le retire quand on le vide', async () => {
    const receipts = new FakeReceipts();
    const { editor, events } = mount(receipts);
    expect(editor.quantity()).toBe(4);

    editor.quantity.set(null);
    await editor.save();

    expect(receipts.calls).toEqual(['withdraw BAG']);
    expect(events).toEqual(['failure -', 'saved']);
  });

  it('reçoit un article qui n’en avait pas', async () => {
    const receipts = new FakeReceipts();
    const { editor } = mount(receipts, { ...ROW, unordered: null });
    editor.quantity.set(3);
    await editor.save();
    expect(receipts.calls).toEqual(['receive BAG 3']);
  });

  it('fait remonter le refus, sans se dire enregistré', async () => {
    const receipts = new FakeReceipts();
    receipts.receive = () => Promise.reject(new Error('refusé'));
    const { editor, events } = mount(receipts, { ...ROW, unordered: null });
    editor.quantity.set(3);
    await editor.save();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatch(/^failure /);
    expect(events).not.toContain('saved');
  });
});
