import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CounterDeliveryNoteService } from '../../comptoir/counter-delivery-note.service';
import { CounterOrderSheetService } from '../../comptoir/counter-order-sheet.service';
import { CounterNotePanel, type CounterNotePanelData } from './counter-note-panel';

const PDF = (): Blob => new Blob(['%PDF-1.7'], { type: 'application/pdf' });

class FakeNotes {
  readonly asked: string[] = [];
  carrierPdf(orderId: string): Promise<Blob> {
    this.asked.push(orderId);
    return Promise.resolve(PDF());
  }
}

class FakeSheets {
  readonly asked: string[] = [];
  fails = false;
  pdf(orderId: string): Promise<Blob> {
    this.asked.push(orderId);
    return this.fails ? Promise.reject(new Error('Commande introuvable.')) : Promise.resolve(PDF());
  }
}

async function render(
  data: CounterNotePanelData,
  notes = new FakeNotes(),
  sheets = new FakeSheets(),
): Promise<ComponentFixture<CounterNotePanel>> {
  TestBed.configureTestingModule({
    imports: [CounterNotePanel],
    providers: [
      { provide: CounterDeliveryNoteService, useValue: notes },
      { provide: CounterOrderSheetService, useValue: sheets },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
    ],
  });
  const fixture = TestBed.createComponent(CounterNotePanel);
  fixture.componentRef.setInput('data', data);
  await settle(fixture);
  return fixture;
}

/** Le refus se lit dans un `Blob`, de façon asynchrone : quelques passes. */
async function settle(fixture: ComponentFixture<CounterNotePanel>): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

const text = (fixture: ComponentFixture<CounterNotePanel>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('CounterNotePanel — les deux bons du comptoir', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:bon', revokeObjectURL: vi.fn() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('le bon de commande lit la route du comptoir, pas celle du BL', async () => {
    const notes = new FakeNotes();
    const sheets = new FakeSheets();
    const fixture = await render(
      { orderId: 'ord_1', reference: 'CMD-1042', document: 'order' },
      notes,
      sheets,
    );

    expect(sheets.asked).toEqual(['ord_1']);
    expect(notes.asked).toEqual([]);
    expect(text(fixture)).toContain('Bon de commande');
    expect((fixture.nativeElement as HTMLElement).querySelector('iframe')).not.toBeNull();
  });

  it('le bon de livraison lit le BL de la remise', async () => {
    const notes = new FakeNotes();
    const sheets = new FakeSheets();
    const fixture = await render(
      { orderId: 'ord_1', reference: 'CMD-1042', document: 'delivery' },
      notes,
      sheets,
    );

    expect(notes.asked).toEqual(['ord_1']);
    expect(sheets.asked).toEqual([]);
    expect(text(fixture)).toContain('Bon de livraison');
  });

  it('un refus le dit, et « Réessayer » relit', async () => {
    const sheets = new FakeSheets();
    sheets.fails = true;
    const fixture = await render(
      { orderId: 'ord_1', reference: 'CMD-1042', document: 'order' },
      new FakeNotes(),
      sheets,
    );

    expect(text(fixture)).toContain('Bon de commande illisible');
    sheets.fails = false;
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Réessayer'))
      ?.click();
    await settle(fixture);

    expect(sheets.asked).toHaveLength(2);
    expect((fixture.nativeElement as HTMLElement).querySelector('iframe')).not.toBeNull();
  });
});
