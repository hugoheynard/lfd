import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { TagRemovePanel, imagesLabel } from './tag-remove-panel';

/** Ce que ces cas tiennent : **la question porte le compte**. */
describe('supprimer un mot-clé partout', () => {
  function panel(count: number): { screen: TagRemovePanel; closed: unknown[] } {
    const closed: unknown[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: FoldPanelRef, useValue: { close: (r?: unknown): number => closed.push(r) } },
      ],
    });
    const fixture = TestBed.createComponent(TagRemovePanel);
    fixture.componentRef.setInput('data', { tag: { tag: 'croisant', count } });
    fixture.detectChanges();
    return { screen: fixture.componentInstance, closed };
  }

  it('demande avec le nombre d’images', () => {
    expect(panel(3).screen['question']()).toBe('Retirer « croisant » de 3 images ?');
    expect(panel(1).screen['question']()).toBe('Retirer « croisant » de 1 image ?');
  });

  it('rend `true` à la confirmation, rien à l’annulation', () => {
    const { screen, closed } = panel(3);

    screen['cancel']();
    screen['confirm']();

    expect(closed).toEqual([undefined, true]);
  });

  it('accorde le nombre', () => {
    expect(imagesLabel(0)).toBe('0 images');
    expect(imagesLabel(1)).toBe('1 image');
  });
});
