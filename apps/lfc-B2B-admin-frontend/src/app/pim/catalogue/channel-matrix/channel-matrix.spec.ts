import { TestBed } from '@angular/core/testing';

import type { Emplacement, SalesChannels } from '../../data/models';
import { ChannelMatrix } from './channel-matrix';

const CHANNELS: SalesChannels = {
  boutiques: {
    emp_village: { emporter: true, surPlace: true },
    emp_val: { emporter: true, surPlace: false },
  },
  b2b: false,
};

/** Les points de vente sont une DONNÉE : la grille en reçoit la liste. */
const EMPLACEMENTS: Emplacement[] = [
  {
    id: 'emp_village',
    name: 'Village',
    clickCollect: true,
    surPlace: true,
    baseUrl: '',
    tables: [],
  },
  { id: 'emp_val', name: 'Val', clickCollect: true, surPlace: false, baseUrl: '', tables: [] },
];

function render(
  inherited: boolean,
  emplacements: Emplacement[] = EMPLACEMENTS,
  unreadable: string | null = null,
) {
  const fixture = TestBed.createComponent(ChannelMatrix);
  fixture.componentRef.setInput('channels', CHANNELS);
  fixture.componentRef.setInput('emplacements', emplacements);
  fixture.componentRef.setInput('unreadable', unreadable);
  fixture.componentRef.setInput('inherited', inherited);
  fixture.detectChanges();
  return fixture;
}

describe('ChannelMatrix', () => {
  it('shows the inherited badge and no revert control when inherited', () => {
    const text = render(true).nativeElement.textContent ?? '';
    expect(text).toContain('Hérité de la gamme');
    expect(text).not.toContain('Revenir au défaut');
  });

  it('exposes a revert control when personnalisé, and emits on click', () => {
    const fixture = render(false);
    let reverted = false;
    fixture.componentInstance.revert.subscribe(() => (reverted = true));

    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    expect(button?.textContent).toContain('Revenir au défaut');

    button?.click();
    expect(reverted).toBe(true);
  });

  it('rend une ligne par emplacement RÉEL, avec son nom du référentiel', () => {
    // C'étaient deux lignes en dur, dont l'une nommait « Ardroit » — une
    // boutique absente de la base. Les noms viennent maintenant de la liste.
    const text = render(true).nativeElement.textContent ?? '';

    expect(text).toContain('Village');
    expect(text).toContain('Val');
  });

  it("le dit plutôt que d'afficher une grille vide quand il n'y a aucun emplacement", () => {
    const text = render(true, []).nativeElement.textContent ?? '';

    expect(text).toContain('Aucun emplacement');
  });

  it("ne confond pas « aucun » avec « je n'ai pas pu lire »", () => {
    // Les deux rendaient la même ligne, et la première invite à recréer ce qui
    // existe déjà — le pire conseil possible sur un backend éteint.
    const text = render(true, [], 'Serveur injoignable.').nativeElement.textContent ?? '';

    expect(text).toContain('illisibles');
    expect(text).toContain('Serveur injoignable.');
    expect(text).not.toContain('Créez-en un');
  });
});
