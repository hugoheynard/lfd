import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { QuantityRail } from './quantity-rail';

describe('QuantityRail', () => {
  let fixture: ComponentFixture<QuantityRail>;

  const buttons = (): HTMLButtonElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  const minus = (): HTMLButtonElement => buttons()[0] as HTMLButtonElement;
  const plus = (): HTMLButtonElement => buttons()[1] as HTMLButtonElement;

  function render(quantity: number): void {
    fixture = TestBed.createComponent(QuantityRail);
    fixture.componentRef.setInput('quantity', quantity);
    fixture.componentRef.setInput('addLabel', 'Ajouter un croissant');
    fixture.componentRef.setInput('removeLabel', 'Retirer un croissant');
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [QuantityRail] });
  });

  it('montre la quantité entre les deux gestes', () => {
    render(3);

    expect((fixture.nativeElement as HTMLElement).querySelector('.qty')?.textContent?.trim()).toBe(
      '3',
    );
  });

  /**
   * 🔴 Le retrait est **désactivé** à zéro, pas absent : un bouton qui
   * disparaît déplace celui d'à côté, et on appuie alors sur l'autre.
   */
  it('désactive le retrait à zéro plutôt que de l’effacer', () => {
    render(0);

    expect(buttons()).toHaveLength(2);
    expect(minus().disabled).toBe(true);
    expect(plus().disabled).toBe(false);
  });

  it('rouvre le retrait dès la première pièce', () => {
    render(1);

    expect(minus().disabled).toBe(false);
  });

  it('annonce ce que chaque geste fait, sans le déduire de l’icône', () => {
    render(1);

    expect(minus().getAttribute('aria-label')).toBe('Retirer un croissant');
    expect(plus().getAttribute('aria-label')).toBe('Ajouter un croissant');
  });

  it('remonte les deux gestes séparément', () => {
    render(1);
    const emitted: string[] = [];
    fixture.componentInstance.added.subscribe(() => emitted.push('+'));
    fixture.componentInstance.removed.subscribe(() => emitted.push('−'));

    plus().click();
    minus().click();

    expect(emitted).toEqual(['+', '−']);
  });

  /** La densité suit la place ; elle ne change ni les gestes ni les couleurs. */
  it('porte sa densité sur l’hôte', () => {
    render(1);
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).classList.contains('is-lg')).toBe(true);
  });
});
