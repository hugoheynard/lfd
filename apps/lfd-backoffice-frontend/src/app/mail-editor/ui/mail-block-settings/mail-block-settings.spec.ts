import { TestBed } from '@angular/core/testing';
import type { ColumnsBlock, FreeBlock } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { type CellAddition, MailBlockSettings } from './mail-block-settings';

function render(block: FreeBlock | ColumnsBlock) {
  const fixture = TestBed.createComponent(MailBlockSettings);
  fixture.componentRef.setInput('block', block);
  fixture.detectChanges();
  return fixture;
}

describe('MailBlockSettings', () => {
  it('règle l’adresse d’un bouton', () => {
    const fixture = render({ id: 'b', kind: 'button', label: { fr: 'Voir' }, href: '' });
    const emitted: FreeBlock[] = [];
    fixture.componentInstance.blockChange.subscribe((next) => emitted.push(next));
    const field: HTMLInputElement = fixture.nativeElement.querySelector('[data-href] input');
    field.value = 'https://lafoliedouce.fr';
    field.dispatchEvent(new Event('input'));
    expect(emitted).toEqual([
      { id: 'b', kind: 'button', label: { fr: 'Voir' }, href: 'https://lafoliedouce.fr' },
    ]);
  });

  it('montre le ton d’un encadré, une largeur par colonne', () => {
    expect(
      render({ id: 'c', kind: 'callout', tone: 'info', text: {} }).nativeElement.querySelector(
        '[data-tone]',
      ),
    ).not.toBeNull();
    const columns = render({ id: 'k', kind: 'columns', widths: [33, 33, 33], cells: [[], [], []] });
    expect(columns.nativeElement.querySelectorAll('[data-width]').length).toBe(3);
  });

  it('ajoute un bloc dans la colonne visée, jamais une mise en page', () => {
    const fixture = render({ id: 'k', kind: 'columns', widths: [50, 50], cells: [[], []] });
    const added: CellAddition[] = [];
    fixture.componentInstance.cellAddition.subscribe((next) => added.push(next));
    expect(fixture.nativeElement.querySelector('[data-library-item="columns-2"]')).toBeNull();
    fixture.nativeElement.querySelector('[data-library-item="heading"]').click();
    expect(added).toEqual([{ cellIndex: 0, key: 'heading' }]);
  });
});
