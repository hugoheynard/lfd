import { ComponentFixture, TestBed } from '@angular/core/testing';

import { fill } from '../../../client/copy/client-copy.service';
import { FR } from '../../../client/copy/fr';
import { PickupDialog } from './pickup-dialog';

describe('PickupDialog', () => {
  let fixture: ComponentFixture<PickupDialog>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const cta = (): HTMLElement => {
    const found = el().querySelector('.cta');
    if (!(found instanceof HTMLElement)) {
      throw new Error('Pas de bouton de confirmation.');
    }
    return found;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PickupDialog] });
    fixture = TestBed.createComponent(PickupDialog);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  });

  it("présélectionne l'habitude, et annonce sa remise", () => {
    const on = el().querySelector('.point.on');
    expect(on?.textContent).toContain('Le Labo');
    expect(on?.textContent).toContain(FR.pickupDialog.habit);
    expect(cta().textContent).toContain(fill(FR.pickupDialog.ctaDiscount, { pct: '10' }));
  });

  it('changer de point fait perdre la remise au BOUTON, avant de confirmer', () => {
    // C'est tout l'intérêt de la porter jusque-là : le renoncement se lit.
    const points = el().querySelectorAll('button.point');
    (points[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el().textContent).toContain(FR.pickupDialog.shopPrice);
    expect(cta().textContent?.trim()).toBe(FR.pickupDialog.cta);
  });
});
