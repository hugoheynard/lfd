import { describe, expect, it } from 'vitest';

import {
  NO_DECLARATION,
  declaresNone,
  hasDeclared,
  selectedAllergens,
  withAllergen,
  withCitedAdopted,
  withNoAllergen,
  withTraces,
} from '../allergen-declaration';

/**
 * Le tri-état, éprouvé sans TestBed : c'est un modèle, pas un écran.
 *
 * Ce qu'on tient ici est exactement ce que le booléen `declaresNone` posé à
 * côté d'une liste ne pouvait pas tenir — que `null`, `[]` et une liste soient
 * trois réponses différentes, et qu'aucun geste de l'écran n'en fabrique une à
 * la place d'une autre (plan `plan-separer-allergenes-et-nutrition.md`, §5).
 */
describe('la déclaration d’allergènes — trois états, pas deux', () => {
  it('part du silence : personne ne s’est prononcé', () => {
    expect(hasDeclared(NO_DECLARATION)).toBe(false);
    expect(declaresNone(NO_DECLARATION)).toBe(false);
    expect(selectedAllergens(NO_DECLARATION)).toEqual([]);
  });

  it('distingue « aucun allergène » du silence', () => {
    const affirmed = withNoAllergen(NO_DECLARATION, true);

    expect(affirmed.allergens).toEqual([]);
    expect(declaresNone(affirmed)).toBe(true);
    expect(hasDeclared(affirmed)).toBe(true);
  });

  it('retire l’affirmation sans en poser une autre', () => {
    const lifted = withNoAllergen(withNoAllergen(NO_DECLARATION, true), false);

    expect(lifted.allergens).toBeNull();
    expect(hasDeclared(lifted)).toBe(false);
  });

  /**
   * 🔴 Le cœur du bug 0c. Vider une liste n'est pas affirmer qu'il n'y a rien :
   * décocher la dernière case doit retomber au SILENCE, sans quoi enregistrer
   * enverrait le `[]` que personne n'a coché — et l'invariant 7 rendrait la
   * fiche publiable sur un oubli de saisie.
   */
  it('décocher la dernière case retombe au silence', () => {
    const one = withAllergen(NO_DECLARATION, 'AM', true);

    const none = withAllergen(one, 'AM', false);

    expect(one.allergens).toEqual(['AM']);
    expect(none.allergens).toBeNull();
    expect(declaresNone(none)).toBe(false);
  });

  it('ne double pas un code déjà coché', () => {
    const twice = withAllergen(withAllergen(NO_DECLARATION, 'AM', true), 'AM', true);

    expect(twice.allergens).toEqual(['AM']);
  });

  it('cocher un allergène lève « aucun allergène »', () => {
    const declared = withAllergen(withNoAllergen(NO_DECLARATION, true), 'AM', true);

    expect(declaresNone(declared)).toBe(false);
    expect(declared.allergens).toEqual(['AM']);
  });

  describe('les traces', () => {
    /**
     * Présent et « peut contenir » sont exclusifs : le serveur refuse un code
     * déclaré des deux côtés (`OverlappingAllergensError`). On rend le refus
     * inatteignable plutôt que de le traduire.
     */
    it('un code qui devient une trace quitte la présence', () => {
      const declared = withAllergen(withAllergen(NO_DECLARATION, 'AM', true), 'AN', true);

      const traced = withTraces(declared, ['AM']);

      expect(traced.allergens).toEqual(['AN']);
      expect(traced.mayContain).toEqual(['AM']);
    });

    it('un code qui devient présent quitte les traces', () => {
      const traced = withTraces(NO_DECLARATION, ['AM']);

      const present = withAllergen(traced, 'AM', true);

      expect(present.mayContain).toEqual([]);
      expect(present.allergens).toEqual(['AM']);
    });

    /**
     * Déclarer une trace ne dit RIEN de la présence. Sans cette règle, cocher
     * « peut contenir des fruits à coque » sur une fiche vierge affirmerait au
     * passage qu'elle ne contient aucun allergène.
     */
    it('ne prononce pas la présence', () => {
      const traced = withTraces(NO_DECLARATION, ['AN']);

      expect(hasDeclared(traced)).toBe(false);
      expect(traced.mayContain).toEqual(['AN']);
    });

    /** « Aucun allergène » survit à une trace : ne rien contenir et pouvoir en
     *  porter par contamination d'atelier sont deux faits différents. */
    it('cohabite avec « aucun allergène »', () => {
      const traced = withTraces(withNoAllergen(NO_DECLARATION, true), ['AN']);

      expect(declaresNone(traced)).toBe(true);
      expect(traced.mayContain).toEqual(['AN']);
    });

    it('ne garde pas deux fois le même code', () => {
      expect(withTraces(NO_DECLARATION, ['AN', 'AN']).mayContain).toEqual(['AN']);
    });
  });

  describe('la reprise de ce que la composition cite', () => {
    it('coche les codes cités et lève l’affirmation', () => {
      const adopted = withCitedAdopted(withNoAllergen(NO_DECLARATION, true), ['AM']);

      expect(declaresNone(adopted)).toBe(false);
      expect(adopted.allergens).toEqual(['AM']);
    });

    /** Jamais de retrait : un allergène déclaré à la main tient. */
    it('n’enlève rien de ce qui était déjà déclaré', () => {
      const declared = withAllergen(NO_DECLARATION, 'UW', true);

      const adopted = withCitedAdopted(declared, ['AM']);

      expect([...(adopted.allergens ?? [])].sort()).toEqual(['AM', 'UW']);
    });
  });
});
