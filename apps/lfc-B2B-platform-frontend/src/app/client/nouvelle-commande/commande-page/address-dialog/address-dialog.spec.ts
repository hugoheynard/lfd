import { ComponentFixture, TestBed } from '@angular/core/testing';

import { fill } from '../../../../client/copy/client-copy.service';
import { FR } from '../../../../client/copy/fr';
import { AddressDialog } from './address-dialog';

/**
 * Le dialogue est piloté par le DOM. Le `<dialog>` natif n'a pas de `showModal`
 * dans l'environnement de test — le composant le sait et s'en passe ; son
 * contenu reste interrogeable, ce qui suffit à tenir le raisonnement.
 */
describe('AddressDialog', () => {
  let fixture: ComponentFixture<AddressDialog>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';
  const cta = (): HTMLButtonElement => {
    const found = el().querySelector('.cta');
    if (!(found instanceof HTMLButtonElement)) {
      throw new Error('Pas de bouton de confirmation.');
    }
    return found;
  };

  const type = (selector: string, value: string): void => {
    const input = el().querySelector(`${selector} input`);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Pas de champ ${selector}.`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AddressDialog] });
    fixture = TestBed.createComponent(AddressDialog);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  });

  it("ouvre sur l'adresse par défaut, et son tarif", () => {
    expect(text()).toContain(FR.addressDialog.defaultTag);
    expect(text()).toContain('Zone 1');
    expect(cta().textContent).toContain(fill(FR.addressDialog.cta, { fee: '20' }));
  });

  it('la ville se déduit du code postal, et la zone avec elle', () => {
    type('.postcode', '73130');

    const city = el().querySelector('.city input');
    expect(city instanceof HTMLInputElement && city.value).toBe('Bourg-Saint-Maurice');
    expect(text()).toContain('Zone 2');
    // Le tarif suit la zone, pas le panier — et le bouton le PORTE.
    expect(cta().textContent).toContain(fill(FR.addressDialog.cta, { fee: '50' }));
  });

  it('saisir une adresse quitte le carnet : une seule peut gagner', () => {
    expect(el().querySelector('.entry.on')).not.toBeNull();

    type('.street', '12 rue du Coin Ferrand');

    expect(el().querySelector('.entry.on')).toBeNull();
  });

  it('hors zone, le dialogue le DIT et ne laisse pas confirmer', () => {
    type('.street', '3 rue de Nulle Part');
    type('.postcode', '75001');

    expect(text()).toContain(FR.addressDialog.outOfZone);
    expect(cta().textContent).toContain(FR.addressDialog.ctaBlocked);
    expect(cta().disabled).toBe(true);
  });

  it('le bouton mène au CRÉNEAU, puis au panier', () => {
    let done = 0;
    fixture.componentInstance.done.subscribe(() => (done += 1));

    type('.street', '12 rue du Coin Ferrand');
    type('.postcode', '73130');
    cta().click();
    fixture.detectChanges();

    // Le second volet rappelle l'adresse : on ne perd pas ce qu'on vient de dire.
    expect(el().querySelector('app-slot-step')?.textContent).toContain(
      '12 rue du Coin Ferrand, 73130',
    );
    expect(cta().disabled).toBe(true);

    (el().querySelectorAll('button.slot')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    cta().click();

    expect(done).toBe(1);
  });
});
