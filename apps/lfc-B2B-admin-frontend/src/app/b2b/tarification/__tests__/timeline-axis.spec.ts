import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  TimelineAxis,
  type AxisBand,
  type AxisSelection,
} from '../frise/timeline-axis/timeline-axis';

/**
 * **Les deux gestes de l'axe.**
 *
 * Un clic pose un marqueur, un clic maintenu puis glissé ouvre une zone. Ce
 * fichier fige la frontière entre les deux : sans seuil, une main qui tremble
 * transformerait chaque clic en période d'un jour, et l'écran répondrait à une
 * question que personne n'a posée.
 */

const BANDS: readonly AxisBand[] = [
  {
    id: 'promo',
    label: 'Promo de rentrée',
    validFrom: '2026-08-01T00:00:00.000Z',
    validTo: '2026-08-31T00:00:00.000Z',
  },
];

function mount(): ComponentFixture<TimelineAxis> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(TimelineAxis);
  fixture.componentRef.setInput('bands', BANDS);
  fixture.detectChanges();
  return fixture;
}

/** Un pointeur doublé : la piste fait 1000 px, donc 1 px = 0,1 %. */
function pointerAt(x: number): PointerEvent {
  const track = {
    getBoundingClientRect: () => ({ left: 0, width: 1000 }) as DOMRect,
    setPointerCapture: () => undefined,
  };
  return {
    clientX: x,
    pointerId: 1,
    currentTarget: track,
    target: track,
  } as unknown as PointerEvent;
}

function drag(fixture: ComponentFixture<TimelineAxis>, fromX: number, toX: number): AxisSelection {
  const axis = fixture.componentInstance;
  let captured: AxisSelection | null = null;
  axis.selected.subscribe((selection) => (captured = selection));

  axis['onPointerDown'](pointerAt(fromX));
  axis['onPointerMove'](pointerAt(toX));
  axis['onPointerUp'](pointerAt(toX));

  if (captured === null) {
    throw new Error("L'axe n'a rien émis.");
  }
  return captured;
}

/** La forme attendue d'une étiquette : le jour retenu, rendu en UTC. */
function frenchDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

describe("les marqueurs de l'axe", () => {
  it('pose UN marqueur sur un clic net', () => {
    const selection = drag(mount(), 400, 400);

    expect(selection.kind).toBe('instant');
  });

  /** Une main qui tremble ne demande pas une période d'un jour. */
  it('reste un clic quand le glissement est minuscule', () => {
    const selection = drag(mount(), 400, 405);

    expect(selection.kind).toBe('instant');
  });

  it('ouvre une zone dès que le glissement est franc', () => {
    const selection = drag(mount(), 200, 600);

    expect(selection.kind).toBe('zone');
  });

  /** Glisser vers la gauche ouvre la même période : les bornes se remettent d'aplomb. */
  it('remet les bornes dans l’ordre quand on glisse à l’envers', () => {
    const forward = drag(mount(), 200, 600);
    const backward = drag(mount(), 600, 200);

    expect(backward).toEqual(forward);
  });

  it('rend des jours, jamais des millisecondes', () => {
    const selection = drag(mount(), 200, 600);

    if (selection.kind !== 'zone') {
      throw new Error('Attendu une zone.');
    }
    expect(selection.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(selection.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(selection.from < selection.to).toBe(true);
  });

  /**
   * **L'étiquette sous le doigt dit le jour qui sera retenu.**
   *
   * Elle ne le disait pas : la sélection s'arrondissait au jour UTC pendant que
   * l'étiquette formatait l'instant survolé dans le fuseau du navigateur. À
   * Paris l'été, tout point tombant après 22 h UTC — environ 8 % de la largeur —
   * annonçait le lendemain et retenait la veille, pendant que le titre du
   * tableau, lui, écrivait la veille. Deux dates à l'écran pour un seul geste.
   *
   * Balayé sur toute la piste plutôt que sur un point choisi : le décalage ne se
   * produit que sur une bande étroite, et un test qui viserait « une date »
   * serait resté vert sur le bug.
   */
  it('étiquette exactement le jour qu’elle retient, sur toute la piste', () => {
    const fixture = mount();
    const axis = fixture.componentInstance;
    let checked = 0;

    for (let x = 0; x <= 1000; x += 1) {
      // Lue PENDANT le geste, doigt encore posé : c'est le seul moment où
      // l'étiquette parle d'un instant libre. Une fois relâchée, la sélection
      // est déjà arrondie au jour, et la comparaison ne prouverait plus rien —
      // c'est exactement l'erreur de la première version de ce test.
      axis['onPointerDown'](pointerAt(x));
      axis['onPointerMove'](pointerAt(x));
      const shown = axis['labels']()[0]?.day;

      let retained: AxisSelection | null = null;
      const stop = axis.selected.subscribe((selection) => (retained = selection));
      axis['onPointerUp'](pointerAt(x));
      stop.unsubscribe();

      if (retained === null || retained['kind'] !== 'instant') {
        throw new Error('Attendu un marqueur.');
      }
      expect(shown).toBe(frenchDay(retained['day']));
      checked += 1;
    }

    expect(checked).toBe(1001);
  });

  /** Les barres des décisions restent visibles : c'est ce qu'on vise. */
  it('dessine une barre par décision', () => {
    const fixture = mount();

    expect(fixture.nativeElement.querySelectorAll('.bar').length).toBe(1);
    expect(String(fixture.nativeElement.textContent)).toContain('Promo de rentrée');
  });
});
