import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceFloorView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { FloorValueForm } from './floor-value-form';

/**
 * - un montant n'a de sens que sur une unité : au-delà, l'écran ne le propose pas ;
 * - la saisie part dans les unités du FIL (points de base, millicentimes) ;
 * - une porte a une clé et reste sous le mur, ou rien ne part ;
 * - une porte posée est relue — la re-poser ne l'efface plus.
 */

function mount(inputs: Record<string, unknown> = {}): ComponentFixture<FloorValueForm> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(FloorValueForm);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture;
}

describe("l'unité de la limite", () => {
  it("s'ouvre en pourcentage au-delà d'un article, et refuse d'en changer", () => {
    const form = mount({ unitScoped: false }).componentInstance;

    expect(form['mode']()).toBe('percent');
    form['setMode']('amount');
    expect(form['mode']()).toBe('percent');
  });

  it('écrit pourquoi le choix ne se pose pas', () => {
    expect(String(mount().nativeElement.textContent)).toContain('En pourcentage du tarif');
  });

  it('laisse choisir sur un article', () => {
    const form = mount({ unitScoped: true }).componentInstance;

    form['setMode']('percent');
    expect(form['mode']()).toBe('percent');
    form['setMode']('amount');
    expect(form['mode']()).toBe('amount');
  });
});

describe('le brouillon', () => {
  it('part en points de base pour un pourcentage', () => {
    const form = mount().componentInstance;
    form['setAmount']('40');

    expect(form['draft']()).toEqual({ mode: 'percent', value: 4000, dynamic: null });
  });

  it('ne part pas au-delà de 100 %', () => {
    const form = mount().componentInstance;
    form['setAmount']('120');

    expect(form['draft']()).toBeNull();
  });

  it('refuse une porte sans clé, ou au-dessus du mur', () => {
    const form = mount().componentInstance;
    form['setAmount']('50');
    form['setDoorAmount']('40');
    expect(form['draft']()).toBeNull();

    form['setDoorQuantity']('20');
    expect(form['draft']()?.dynamic).toEqual({
      mode: 'percent',
      value: 4000,
      unlock: { minQuantity: 20, minVolumeRatioBp: null },
    });

    form['setDoorAmount']('60');
    expect(form['draft']()).toBeNull();
  });

  it('relit la porte d’une limite posée', () => {
    const initial: PriceFloorView = {
      id: 'global',
      scope: { type: 'global', id: null },
      mode: 'percent',
      value: 5000,
      dynamic: {
        mode: 'percent',
        value: 4000,
        unlock: { minQuantity: null, minVolumeRatioBp: 12_500 },
      },
      drift: null,
      createdBy: 'staff',
      createdByName: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const form = mount({ initial }).componentInstance;

    expect(form['draft']()?.dynamic).toEqual(initial.dynamic);
  });
});

/**
 * Régression : une porte posée dans une AUTRE unité que son mur s'affichait
 * vide, et l'enregistrement la renvoyait `null` — une décision d'argent
 * effacée sans que personne l'ait demandé (corrigé le 2026-09-25).
 */
describe('la porte gardée', () => {
  const WALL_PERCENT: PriceFloorView = {
    id: 'product:VIE-001',
    scope: { type: 'product', id: 'VIE-001' },
    mode: 'percent',
    value: 5000,
    // 0,80 € — en MONTANT, sous un mur en pourcentage.
    dynamic: { mode: 'amount', value: 80_000, unlock: { minQuantity: 20, minVolumeRatioBp: null } },
    drift: null,
    createdBy: 'staff',
    createdByName: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
  };

  it('ne perd pas la porte dynamique posée dans une autre unité', () => {
    const fixture = mount({ unitScoped: true, initial: WALL_PERCENT });
    const form = fixture.componentInstance;

    expect(String(fixture.nativeElement.textContent)).toContain('0,80');
    form['setAmount']('55');

    expect(form['draft']()).toEqual({
      mode: 'percent',
      value: 5500,
      dynamic: WALL_PERCENT.dynamic,
    });
  });

  it('bloque un changement d’unité qui laisserait la porte incohérente, et le dit', () => {
    const sameUnit: PriceFloorView = {
      ...WALL_PERCENT,
      dynamic: {
        mode: 'percent',
        value: 4000,
        unlock: { minQuantity: 20, minVolumeRatioBp: null },
      },
    };
    const fixture = mount({ unitScoped: true, initial: sameUnit });
    const form = fixture.componentInstance;

    form['setMode']('amount');
    form['setAmount']('1,50');
    fixture.detectChanges();

    expect(form['draft']()).toBeNull();
    expect(String(fixture.nativeElement.textContent)).toContain('la porte actuelle sera retirée');

    form['dropDoor']();
    expect(form['draft']()).toEqual({ mode: 'amount', value: 150_000, dynamic: null });
  });

  it('ne retire la porte que sur un geste explicite', () => {
    const form = mount({ unitScoped: true, initial: WALL_PERCENT }).componentInstance;

    form['dropDoor']();

    expect(form['draft']()?.dynamic).toBeNull();
  });
});
