import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ALL_MEDIA, type MediaFeedCriteria } from '../media-feed-url';
import { MediaToolbar } from './media-toolbar';

function mount(criteria: MediaFeedCriteria, total: number | null = null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(MediaToolbar);
  fixture.componentRef.setInput('criteria', criteria);
  fixture.componentRef.setInput('total', total);
  const emitted: MediaFeedCriteria[] = [];
  fixture.componentInstance.changed.subscribe((next) => emitted.push(next));
  fixture.detectChanges();
  return { toolbar: fixture.componentInstance, fixture, emitted };
}

describe("la barre d'outils de la médiathèque", () => {
  it('rend les critères ENTIERS, pas un morceau', () => {
    const { toolbar, emitted } = mount({ ...ALL_MEDIA, q: 'croissant' });
    toolbar['set']({ unused: true });
    expect(emitted).toEqual([{ ...ALL_MEDIA, q: 'croissant', unused: true }]);
  });

  it('relâche un mot-clé retenu sans toucher aux autres', () => {
    const { toolbar, emitted } = mount({ ...ALL_MEDIA, tags: ['a', 'b'] });
    toolbar['release']('a');
    expect(emitted[0]?.tags).toEqual(['b']);
  });

  it('« Tout afficher » efface les filtres et garde le tri', () => {
    const { toolbar, emitted } = mount({
      ...ALL_MEDIA,
      sort: 'uses',
      untagged: true,
      from: '2026-10-01',
    });
    toolbar['showAll']();
    expect(emitted).toEqual([{ ...ALL_MEDIA, sort: 'uses' }]);
  });

  it('ne propose « Tout afficher » que sous un filtre', () => {
    expect(mount({ ...ALL_MEDIA, sort: 'name' }).toolbar['filtering']()).toBe(false);
    expect(mount({ ...ALL_MEDIA, unused: true }).toolbar['filtering']()).toBe(true);
  });

  it('compte au singulier et au pluriel, et se tait tant que rien n’est lu', () => {
    expect(mount(ALL_MEDIA, 1).toolbar['count']()).toBe('1 image');
    expect(mount(ALL_MEDIA, 17).toolbar['count']()).toBe('17 images');
    expect(mount(ALL_MEDIA, null).toolbar['count']()).toBeNull();
  });

  it('dit l’état des bascules à qui ne les voit pas', () => {
    const { fixture } = mount({ ...ALL_MEDIA, untagged: true });
    const pressed = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[aria-pressed]')];
    expect(pressed.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });
});
