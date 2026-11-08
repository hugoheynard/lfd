import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { LIBRARY_ITEMS, type LibraryItemKey } from '../../rules/mail-document-edits';
import { MailBlockLibrary } from './mail-block-library';

function render() {
  const fixture = TestBed.createComponent(MailBlockLibrary);
  fixture.componentRef.setInput('connectedTo', 'mail-canvas-blocks-test');
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element };
}

describe('MailBlockLibrary', () => {
  it('montre une carte par bloc — nom et ce qu’il fait — et dit laquelle est cliquée', () => {
    const { fixture, element } = render();
    const picked: LibraryItemKey[] = [];
    fixture.componentInstance.picked.subscribe((key) => picked.push(key));
    const cards = element.querySelectorAll('[data-library-item]');
    expect(cards.length).toBe(LIBRARY_ITEMS.length);
    const columns = element.querySelector<HTMLElement>('[data-library-item="columns-3"]');
    expect(columns?.textContent).toContain('Trois colonnes');
    expect(columns?.textContent).toContain('Trois blocs côte à côte.');
    expect(columns?.getAttribute('role')).toBe('button');
    columns?.click();
    expect(picked).toEqual(['columns-3']);
  });

  it('chaque carte se glisse vers le canevas, avec sa clé ; la liste ne trie ni ne reçoit', () => {
    const { fixture } = render();
    const list = fixture.debugElement.query(By.directive(CdkDropList)).injector.get(CdkDropList);
    expect(list.sortingDisabled).toBe(true);
    expect(list.connectedTo).toEqual(['mail-canvas-blocks-test']);
    const drags = fixture.debugElement
      .queryAll(By.directive(CdkDrag))
      .map((node) => node.injector.get(CdkDrag));
    expect(drags.map((drag) => drag.data)).toEqual(LIBRARY_ITEMS.map((item) => item.key));
    const first = drags[0];
    expect(first === undefined ? true : list.enterPredicate(first, list)).toBe(false);
  });

  it('la carte tirée laisse sa jumelle à sa place : la bibliothèque ne perd pas sa carte', () => {
    const { fixture, element } = render();
    const drag = fixture.debugElement
      .query(By.css('[data-library-drag="image"]'))
      .injector.get(CdkDrag);
    expect(element.querySelector('[data-library-twin]')).toBeNull();
    drag.started.emit({ source: drag, event: new MouseEvent('mousedown') });
    fixture.detectChanges();
    expect(element.querySelector('[data-library-twin]')?.textContent).toContain('Image');
    drag.ended.emit({
      source: drag,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    });
    fixture.detectChanges();
    expect(element.querySelector('[data-library-twin]')).toBeNull();
    expect(element.querySelectorAll('[data-library-item]').length).toBe(LIBRARY_ITEMS.length);
  });
  it('se connecte à plusieurs listes, cellules d’abord, et dit quelle carte est tirée', () => {
    const { fixture } = render();
    fixture.componentRef.setInput('connectedTo', ['cellule', 'fil']);
    fixture.detectChanges();
    const list = fixture.debugElement.query(By.directive(CdkDropList)).injector.get(CdkDropList);
    expect(list.connectedTo).toEqual(['cellule', 'fil']);
    const dragging: (LibraryItemKey | null)[] = [];
    fixture.componentInstance.draggingChange.subscribe((key) => dragging.push(key));
    const drag = fixture.debugElement
      .query(By.css('[data-library-drag="image"]'))
      .injector.get(CdkDrag);
    drag.started.emit({ source: drag, event: new MouseEvent('mousedown') });
    expect(dragging).toEqual(['image']);
  });
});
