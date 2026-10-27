import { FR } from '../copy/fr';
import { allergenMention } from './allergen-mention';

const FORMS = FR.product;

describe('allergenMention — la mention d’une carte du rayon', () => {
  it('dit les allergènes, puis les traces', () => {
    expect(
      allergenMention(
        { state: 'declared', contains: ['Gluten', 'Lait'], mayContain: ['Sésame'] },
        FORMS,
      ),
    ).toEqual(['Contient : Gluten, Lait', 'Peut contenir : Sésame']);
  });

  it('dit « Aucun allergène » quand c’est déclaré', () => {
    expect(allergenMention({ state: 'none', contains: [], mayContain: [] }, FORMS)).toEqual([
      'Aucun allergène',
    ]);
  });

  it('dit la précaution avant les traces, même sans composition', () => {
    expect(
      allergenMention({ state: 'precautionary', contains: [], mayContain: ['Gluten'] }, FORMS),
    ).toEqual(['Information précise non disponible', 'Peut contenir : Gluten']);
  });

  it('ne dit rien quand le serveur ne sert rien', () => {
    expect(allergenMention(undefined, FORMS)).toEqual([]);
  });
});
