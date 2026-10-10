import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import {
  TagRenamePanel,
  type TagRenamePanelData,
  type TagRenamePanelResult,
} from './tag-rename-panel';

/**
 * Ce que ces cas tiennent : **une fusion se dit AVANT**, avec les deux
 * comptes. Le serveur ne la distingue pas d'un renommage, et elle ne se
 * défait pas.
 */

const DATA: TagRenamePanelData = {
  tag: { tag: 'croisant', count: 3 },
  vocabulary: [
    { tag: 'croisant', count: 3 },
    { tag: 'croissant', count: 12 },
  ],
};

function panel(): { screen: TagRenamePanel; closed: TagRenamePanelResult[] } {
  const closed: TagRenamePanelResult[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: FoldPanelRef,
        useValue: {
          close: (result?: TagRenamePanelResult): void => {
            if (result !== undefined) {
              closed.push(result);
            }
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TagRenamePanel);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  return { screen: fixture.componentInstance, closed };
}

describe('renommer un mot-clé', () => {
  it('part du mot actuel, et refuse de le renvoyer inchangé', () => {
    const { screen, closed } = panel();

    expect(screen['draft']()).toBe('croisant');
    expect(screen['blocked']()).toBe(true);
    screen['submit']();
    expect(closed).toEqual([]);
  });

  it('refuse un mot vide', () => {
    const { screen } = panel();

    screen['draft'].set('   ');

    expect(screen['blocked']()).toBe(true);
  });

  it('annonce la fusion avec les deux comptes quand le mot existe déjà', () => {
    const { screen } = panel();

    screen['draft'].set('Croissant ');

    expect(screen['merge']()).toBe('« croisant » (3) sera fusionné dans « croissant » (12).');
    expect(screen['target']()).not.toBeNull();
  });

  it('ne parle pas de fusion pour un mot neuf, et rend le mot normalisé', () => {
    const { screen, closed } = panel();

    screen['draft'].set('Viennoiserie');
    screen['submit']();

    expect(screen['merge']()).toBeNull();
    expect(closed).toEqual([{ to: 'viennoiserie' }]);
  });
});
