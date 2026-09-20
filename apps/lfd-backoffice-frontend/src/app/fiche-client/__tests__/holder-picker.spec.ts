import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HolderPicker, type HolderChoice } from '../holder-picker/holder-picker';

interface Harness {
  readonly picker: HolderPicker;
  readonly emitted: (HolderChoice | null)[];
  /** Fait tourner les effets — l'app est zoneless, rien ne se propage tout seul. */
  readonly flush: () => void;
}

function setup(): Harness {
  const fixture = TestBed.createComponent(HolderPicker);
  const emitted: (HolderChoice | null)[] = [];
  fixture.componentInstance.holderChange.subscribe((choice) => emitted.push(choice));
  fixture.detectChanges();
  return {
    picker: fixture.componentInstance,
    emitted,
    flush: () => {
      TestBed.tick();
    },
  };
}

describe('HolderPicker', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("n'exige que l'adresse", () => {
    // C'est par elle que le détenteur recevra son mot de passe. Exiger le nom
    // bloquerait une saisie faite au comptoir pour une donnée de confort.
    const { picker, emitted, flush } = setup();

    picker['email'].set('jean@comptoir.fr');
    flush();

    expect(emitted.at(-1)).toEqual({
      email: 'jean@comptoir.fr',
      firstName: '',
      lastName: '',
      phone: '',
    });
  });

  it('ne retient personne tant que l’adresse est vide', () => {
    const { picker, emitted, flush } = setup();

    picker['firstName'].set('Jean');
    flush();

    expect(emitted.at(-1)).toBeNull();
  });

  it('rogne ce qui est saisi', () => {
    // Un espace de copier-coller ne doit pas devenir une adresse que le serveur
    // traiterait comme une seconde personne.
    const { picker, emitted, flush } = setup();

    picker['email'].set('  jean@comptoir.fr  ');
    picker['phone'].set(' 06 11 22 33 44 ');
    flush();

    expect(emitted.at(-1)).toMatchObject({
      email: 'jean@comptoir.fr',
      phone: '06 11 22 33 44',
    });
  });

  it('ne cherche RIEN : aucune dépendance vers le service des comptes', () => {
    // Garde-fou de confidentialité. Le jour où quelqu'un rebranche une
    // recherche « pour aider », ce test tombe : chercher une personne
    // révélerait les sociétés qu'elle détient déjà.
    expect(HolderPicker.prototype).not.toHaveProperty('search');
  });
});
