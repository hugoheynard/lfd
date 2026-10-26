import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { RovingRadioGroup } from './roving-radio-group';

/** Un groupe de trois choix, dont le troisième est fermé — comme un créneau complet. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingRadioGroup],
  template: `
    <div role="radiogroup" appRovingRadioGroup aria-label="Choix">
      @for (option of options; track option.id) {
        <button
          type="button"
          role="radio"
          [disabled]="option.closed"
          [attr.aria-checked]="picked() === option.id"
          (click)="picked.set(option.id)"
        >
          {{ option.id }}
        </button>
      }
    </div>
  `,
})
class Host {
  readonly options = [
    { id: 'a', closed: false },
    { id: 'b', closed: false },
    { id: 'c', closed: true },
    { id: 'd', closed: false },
  ];
  readonly picked = signal<string | null>(null);
}

describe('RovingRadioGroup', () => {
  let fixture: ComponentFixture<Host>;

  const radios = (): HTMLButtonElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="radio"]'));
  const stops = (): string[] =>
    radios()
      .filter((radio) => radio.tabIndex === 0 && !radio.disabled)
      .map((radio) => radio.textContent?.trim() ?? '');
  const press = (radio: HTMLElement | undefined, key: string): void => {
    radio?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('n’offre qu’un arrêt : la première radio tant que rien n’est choisi', () => {
    expect(stops()).toEqual(['a']);
  });

  it('l’arrêt suit le choix fait à la souris', async () => {
    radios()[1]?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(stops()).toEqual(['b']);
  });

  it('les flèches choisissent la suivante, sautent la fermée et bouclent', () => {
    press(radios()[0], 'ArrowDown');
    expect(fixture.componentInstance.picked()).toBe('b');
    expect(document.activeElement).toBe(radios()[1]);

    press(radios()[1], 'ArrowRight');
    expect(fixture.componentInstance.picked()).toBe('d');

    press(radios()[3], 'ArrowDown');
    expect(fixture.componentInstance.picked()).toBe('a');

    press(radios()[0], 'ArrowUp');
    expect(fixture.componentInstance.picked()).toBe('d');
  });

  it('Début et Fin vont aux extrémités', () => {
    press(radios()[1], 'End');
    expect(fixture.componentInstance.picked()).toBe('d');
    press(radios()[3], 'Home');
    expect(fixture.componentInstance.picked()).toBe('a');
  });

  it('laisse passer les autres touches', () => {
    press(radios()[0], 'Tab');
    expect(fixture.componentInstance.picked()).toBeNull();
  });
});
