import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LIBRARY_ITEMS, newLibraryBlock } from '../../rules/mail-document-edits';
import { MailBlockSketch } from './mail-block-sketch';

function sketch(key: (typeof LIBRARY_ITEMS)[number]['key']): HTMLElement {
  const fixture = TestBed.createComponent(MailBlockSketch);
  fixture.componentRef.setInput('block', newLibraryBlock(key, 'esquisse'));
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('MailBlockSketch — la forme d’un bloc neuf, sans réseau', () => {
  it('esquisse chaque carte de la bibliothèque sous la sorte que la fabrique lui donne', () => {
    for (const item of LIBRARY_ITEMS) {
      const kind = newLibraryBlock(item.key, 'esquisse').kind;
      expect(sketch(item.key).getAttribute('data-sketch')).toBe(kind);
    }
  });

  it('une mise en page montre ses colonnes, un encadré attention son ton', () => {
    expect(sketch('columns-3').querySelectorAll('.column').length).toBe(3);
    expect(sketch('callout-warning').querySelector('.callout.warning')).not.toBeNull();
    expect(sketch('callout-info').querySelector('.callout.warning')).toBeNull();
  });
});
