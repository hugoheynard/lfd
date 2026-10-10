import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MediaSeriesView } from '@lfd/pim-contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { SeriesListPanel, imagesWording } from './series-list-panel';

const CARTE: MediaSeriesView = {
  id: 's1',
  title: 'Shooting carte 2026',
  shotOn: '2026-03-14',
  note: 'Lumière du matin.',
  images: 12,
  createdAt: '2026-03-20T10:00:00.000Z',
};

function mount(series: readonly MediaSeriesView[]) {
  const edited: (MediaSeriesView | null)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(SeriesListPanel);
  fixture.componentRef.setInput('data', {
    series: () => series,
    failure: () => null,
    edit: (picked: MediaSeriesView | null) => edited.push(picked),
  });
  fixture.detectChanges();
  return { screen: fixture.componentInstance, fixture, edited };
}

describe('la liste des séries', () => {
  it('dit la date en entier, et l’aveu quand elle manque', () => {
    const { screen } = mount([CARTE, { ...CARTE, id: 's2', shotOn: null, images: 0 }]);
    expect(screen['lines']().map((line) => [line.day, line.images])).toEqual([
      ['14 mars 2026', '12 images'],
      ['Date de prise de vue inconnue', 'Aucune image'],
    ]);
  });

  it('compte au singulier et au pluriel', () => {
    expect(imagesWording(1)).toBe('1 image');
    expect(imagesWording(2)).toBe('2 images');
  });

  it('« Modifier » ouvre la série de la ligne', () => {
    const { fixture, edited } = mount([CARTE]);
    const pencil = (fixture.nativeElement as HTMLElement).querySelector('fold-button-icon button');
    (pencil as HTMLButtonElement | null)?.click();
    expect(edited).toEqual([CARTE]);
  });
});
