import { EN } from '../../copy/en';
import { FR } from '../../copy/fr';
import { IT } from '../../copy/it';
import { deliveryCountLabel } from './addresses-section';

describe('le nombre d’adresses de livraison', () => {
  /** Régression : « 1 adresses » se lisait chez toute maison qui n'en a qu'une. */
  it('s’accorde au singulier pour UNE adresse, dans les trois langues', () => {
    expect(deliveryCountLabel(1, FR.account)).toBe('1 adresse');
    expect(deliveryCountLabel(1, EN.account)).toBe('1 address');
    expect(deliveryCountLabel(1, IT.account)).toBe('1 indirizzo');
  });

  it('reste au pluriel au-delà, et à zéro', () => {
    expect(deliveryCountLabel(2, FR.account)).toBe('2 adresses');
    expect(deliveryCountLabel(0, FR.account)).toBe('0 adresses');
    expect(deliveryCountLabel(3, EN.account)).toBe('3 addresses');
    expect(deliveryCountLabel(4, IT.account)).toBe('4 indirizzi');
  });
});
