import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { RowBin, StackTile } from '../delivery-loading-rows';
import type { TileColumn } from '../delivery-loading-tiles';
import { LoadingRowView } from './loading-row-view';

function rowBin(code: string, stopPosition: number, loaded: boolean): RowBin {
  return {
    key: `${code}:whole`,
    binId: code.toLowerCase(),
    code,
    typeLabel: 'Bac M',
    stopPosition,
    customerLabel: 'Client',
    reference: 'CMD-1',
    loaded,
  };
}

function tile(bins: readonly RowBin[], half = false): StackTile {
  return {
    key: bins.map((bin) => bin.key).join('+'),
    bins,
    stopPositions: bins.map((bin) => bin.stopPosition),
    half,
    shared: bins.length > 1,
    isotherm: false,
    loaded: bins.every((bin) => bin.loaded),
  };
}

const COLUMNS: readonly TileColumn[] = [
  {
    stackIndex: 1,
    header: 'Pile 1 · Bac M',
    fill: '1/3',
    footer: 'côté gauche',
    tiles: [
      tile([rowBin('E7C3NJ', 6, true)], true),
      tile([rowBin('H4N9QC', 5, false)]),
      tile([rowBin('P2W7RT', 3, false)]),
    ],
  },
  {
    stackIndex: 2,
    header: 'Pile 2 · Bac S',
    fill: '0/1',
    footer: 'côté droit',
    tiles: [tile([rowBin('B8N3TS', 2, false), rowBin('Y6K2MR', 1, false)], true)],
  },
];

function render(canPick: boolean) {
  const fixture = TestBed.createComponent(LoadingRowView);
  fixture.componentRef.setInput('title', 'Rangée 1 · le fond');
  fixture.componentRef.setInput('columns', COLUMNS);
  fixture.componentRef.setInput('nextKey', 'H4N9QC:whole');
  fixture.componentRef.setInput('canPick', canPick);
  fixture.detectChanges();
  return fixture;
}

describe('LoadingRowView', () => {
  it('dit chaque tuile en mots : arrêt, type, code, état', () => {
    const element = render(true).nativeElement as HTMLElement;
    const labels = [...element.querySelectorAll('[data-row-tile]')].map((button) =>
      button.getAttribute('aria-label'),
    );
    expect(labels).toEqual([
      'Arrêt 6, demi-bac E7C3NJ, chargé — toucher pour le décharger',
      'Arrêt 5, bac H4N9QC, à poser maintenant',
      'Arrêt 3, bac P2W7RT, à charger — toucher pour le désigner comme prochain',
      'Arrêts 2·1, bac partagé B8N3TS · Y6K2MR, à charger — toucher pour le désigner comme prochain',
    ]);
    expect(element.querySelectorAll('[data-row-column]')[1]?.textContent).toContain('côté droit');
  });

  it('un toucher sur une tuile à charger la désigne', () => {
    const fixture = render(true);
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((key) => picked.push(key));
    const tiles = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '[data-row-tile]',
    );
    tiles[2]?.click();
    tiles[3]?.click();
    expect(picked).toEqual(['P2W7RT:whole', 'B8N3TS:whole']);
  });

  it('un toucher sur une tuile chargée propose de la décharger', () => {
    const fixture = render(true);
    const element = fixture.nativeElement as HTMLElement;
    const unloaded: string[] = [];
    fixture.componentInstance.unload.subscribe((binId) => unloaded.push(binId));
    expect(element.querySelector('[data-unload]')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-row-tile]')?.click();
    fixture.detectChanges();
    const button = element.querySelector<HTMLButtonElement>('[data-unload]');
    expect(button?.textContent).toContain('Décharger E7C3NJ');
    button?.click();
    fixture.detectChanges();
    expect(unloaded).toEqual(['e7c3nj']);
    expect(element.querySelector('[data-unload]')).toBeNull();
  });

  it('en lecture seule, aucune tuile ne se désigne', () => {
    const element = render(false).nativeElement as HTMLElement;
    const tiles = [...element.querySelectorAll<HTMLButtonElement>('[data-row-tile]')];
    expect(tiles.every((button) => button.disabled)).toBe(true);
    expect(tiles[2]?.getAttribute('aria-label')).toBe('Arrêt 3, bac P2W7RT, à charger');
  });
});
