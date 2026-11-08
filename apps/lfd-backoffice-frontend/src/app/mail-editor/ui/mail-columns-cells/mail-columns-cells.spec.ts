import { TestBed } from '@angular/core/testing';
import type { ColumnsBlock } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { type CellBlockStep, MailColumnsCells } from './mail-columns-cells';

const BLOCK: ColumnsBlock = {
  id: 'cols',
  kind: 'columns',
  widths: [33, 33, 33],
  cells: [
    [{ id: 'h', kind: 'heading', text: { fr: 'Titre' } }],
    [{ id: 'd', kind: 'divider' }],
    [],
  ],
};
const HTML =
  '<table><tr><td><h2><span data-free-block="h">Titre</span></h2></td><td><hr data-rule /></td><td></td></tr></table>';

function render(acceptsDrop = false) {
  const fixture = TestBed.createComponent(MailColumnsCells);
  fixture.componentRef.setInput('block', BLOCK);
  fixture.componentRef.setInput('html', HTML);
  fixture.componentRef.setInput('locale', 'fr');
  fixture.componentRef.setInput('listPrefix', 'p');
  fixture.componentRef.setInput('canWrite', true);
  fixture.componentRef.setInput('acceptsDrop', acceptsDrop);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element };
}

describe('MailColumnsCells', () => {
  it('une liste par colonne, à la largeur que le serveur écrit, et le rendu de chaque bloc', () => {
    const { element } = render();
    const cells = [...element.querySelectorAll<HTMLElement>('ol[data-cell]')];
    expect(cells.map((cell) => cell.id)).toEqual([
      'p-cell-cols-0',
      'p-cell-cols-1',
      'p-cell-cols-2',
    ]);
    expect(cells.map((cell) => cell.style.flexBasis)).toEqual(['33%', '33%', '34%']);
    expect(element.querySelector('[data-cell-block="h"]')?.textContent).toContain('Titre');
    expect(element.querySelector('[data-cell-block="d"] hr')).not.toBeNull();
  });

  it('hors glisser, une colonne vide se choisit ; pendant, elle s’ouvre en zone de dépôt', () => {
    const { fixture, element } = render();
    const chosen: number[] = [];
    fixture.componentInstance.cellSelected.subscribe((cell) => chosen.push(cell));
    expect(element.querySelector('[data-cell-dropzone]')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-cell-empty]')!.click();
    expect(chosen).toEqual([2]);
    const dragging = render(true).element;
    expect(dragging.querySelector('[data-cell-dropzone]')?.textContent).toContain(
      'Déposer un bloc ici',
    );
    expect(dragging.querySelector('[data-cell-empty]')).toBeNull();
  });

  it('Alt + flèche demande un cran dans la cellule ; Entrée sélectionne', () => {
    const { fixture, element } = render();
    const steps: CellBlockStep[] = [];
    const selected: string[] = [];
    fixture.componentInstance.stepped.subscribe((step) => steps.push(step));
    fixture.componentInstance.innerSelected.subscribe((id) => selected.push(id));
    const inner = element.querySelector('[data-cell-block="h"]')!;
    inner.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    );
    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(steps).toEqual([{ blockId: 'h', delta: 1 }]);
    expect(selected).toEqual(['h']);
  });
});
