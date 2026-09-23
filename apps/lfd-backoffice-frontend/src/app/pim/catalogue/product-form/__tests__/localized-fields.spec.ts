import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore } from '../product-form-store';

function store(): ProductFormStore {
  TestBed.configureTestingModule({ providers: [ProductFormStore, provideHttpClient()] });
  return TestBed.inject(ProductFormStore);
}

/**
 * Le défaut que ces tests ferment est une PERTE DE DONNÉES silencieuse : le
 * formulaire ne tenait que le français, mais chaque enregistrement remplaçait
 * l'objet localisé entier. Corriger un nom effaçait donc sa traduction — sans
 * message, sans trace, et sans qu'aucun écran ne puisse le montrer.
 */
describe('champs traduisibles — écrire une langue n’efface pas les autres', () => {
  it('le nom garde ses traductions quand on corrige le français', () => {
    const s = store();
    s.nameText.set({ fr: 'Tarte', en: 'Tart', it: 'Crostata' });
    s.setName('Tarte au citron');
    expect(s.nameText()).toEqual({ fr: 'Tarte au citron', en: 'Tart', it: 'Crostata' });
  });

  it('écrire une traduction ne touche ni la source ni les autres langues', () => {
    const s = store();
    s.nameText.set({ fr: 'Tarte', en: 'Tart' });
    s.nameLocale.set('it');
    s.setName('Crostata');
    expect(s.nameText()).toEqual({ fr: 'Tarte', en: 'Tart', it: 'Crostata' });
  });

  it('vider une traduction l’EFFACE au lieu d’y laisser du vide', () => {
    // Une chaîne vide compterait comme une langue renseignée partout où on
    // compte les locales remplies — la fiche passerait pour traduite.
    const s = store();
    s.nameText.set({ fr: 'Tarte', en: 'Tart' });
    s.nameLocale.set('en');
    s.setName('   ');
    expect(s.nameText()).toEqual({ fr: 'Tarte' });
  });

  it('le point ambre ne se pose que sur une langue à TRADUIRE', () => {
    const s = store();
    // Rien d'écrit : rien à traduire, donc aucun point — sinon toute fiche
    // neuve serait une alerte permanente.
    expect(s.editorialMissing()).toEqual([]);

    s.editorial.update((fields) => ({ ...fields, descriptionShort: { fr: 'Un résumé' } }));
    expect(s.editorialMissing()).toEqual(['en', 'it']);

    s.editorialLocale.set('en');
    s.setEditorialText('descriptionShort', 'A summary');
    expect(s.editorialMissing()).toEqual(['it']);
  });

  /*
   * 🔴 Le cas « le texte alternatif suit la même règle, par visuel » a été
   * RETIRÉ le 2026-09-23, et pas parce qu'il gênait : la fiche ne porte plus
   * de texte alternatif. Il décrit l'image, qui est partagée, et se saisit
   * dans la médiathèque — c'est là qu'une règle d'écriture par langue doit
   * être éprouvée désormais.
   */

  it('la langue de chaque section est INDÉPENDANTE', () => {
    // Traduire les descriptions ne doit pas forcer à toucher aux noms : un
    // sélecteur partagé aurait imposé de faire les deux d'un coup.
    const s = store();
    s.nameLocale.set('en');
    expect(s.editorialLocale()).toBe('fr');
  });
});
