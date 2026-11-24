import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { SubscriptionLineView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';

import { ClientSubscriptions } from '../../client-subscriptions.service';
import { occurrence } from '../basket.fixture';
import { OccurrenceDialog, type OccurrenceDialogData } from './occurrence-dialog';

const DATA: OccurrenceDialogData = {
  basketId: 'sub_1',
  occurrence: occurrence('2026-12-17', 'planned', {
    lines: [
      { sku: 'PAIN-01', quantity: 4 },
      { sku: 'CROI-02', quantity: 12 },
    ],
  }),
  dayLabel: 'jeudi 17 décembre',
  nameOf: (sku) => (sku === 'PAIN-01' ? 'Pain de campagne' : sku),
};

interface Wire {
  sent: { id: string; day: string; lines: readonly SubscriptionLineView[] }[];
  answer: string | null;
  closes: unknown[];
}

let wire: Wire;
let fixture: ComponentFixture<OccurrenceDialog>;
const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

function render(data: OccurrenceDialogData = DATA): void {
  wire = { sent: [], answer: null, closes: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OccurrenceDialog],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ClientSubscriptions,
        useValue: {
          modify: (id: string, day: string, lines: readonly SubscriptionLineView[]) => {
            wire.sent.push({ id, day, lines });
            return Promise.resolve(wire.answer);
          },
        },
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  fixture = TestBed.createComponent(OccurrenceDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
}

function setQuantity(index: number, value: number): void {
  fixture.debugElement
    .queryAll(By.css('fold-number-input'))
    [index]?.triggerEventHandler('valueChange', value);
  fixture.detectChanges();
}

const save = (): HTMLButtonElement | null =>
  el().querySelector<HTMLButtonElement>('[data-occurrence-save]');

describe('OccurrenceDialog', () => {
  it('titre le jour, et Enregistrer reste éteint tant que rien ne change', () => {
    render();

    expect(el().textContent).toContain('Modifier la commande du jeudi 17 décembre');
    expect(save()?.disabled).toBe(true);
  });

  it('envoie les quantités changées, sans les lignes mises à 0, puis ferme', async () => {
    render();
    setQuantity(0, 6);
    setQuantity(1, 0);

    save()?.click();
    await fixture.whenStable();

    expect(wire.sent).toEqual([
      { id: 'sub_1', day: '2026-12-17', lines: [{ sku: 'PAIN-01', quantity: 6 }] },
    ]);
    expect(wire.closes).toEqual([true]);
  });

  it('refuse un panier vide : il faut sauter, pas tout retirer', () => {
    render();
    setQuantity(0, 0);
    setQuantity(1, 0);

    expect(el().querySelector('[data-occurrence-empty]')).not.toBeNull();
    expect(save()?.disabled).toBe(true);
  });

  it('un refus du serveur reste dans le dialogue, ouvert', async () => {
    render();
    wire.answer = 'Cette échéance est déjà passée.';
    setQuantity(0, 5);

    save()?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('[data-occurrence-refusal]')?.textContent).toContain(
      'Cette échéance est déjà passée.',
    );
    expect(wire.closes).toEqual([]);
  });

  it('une échéance sautée s’enregistre telle quelle : la modifier la rétablit', () => {
    render({ ...DATA, occurrence: { ...DATA.occurrence, state: 'skipped' } });

    expect(save()?.disabled).toBe(false);
  });
});
