import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LIBRARY_ITEMS, type LibraryItemKey } from '../../rules/mail-document-edits';
import { MailBlockLibrary } from './mail-block-library';

describe('MailBlockLibrary', () => {
  it('propose chaque bloc de la bibliothèque et dit lequel est choisi', () => {
    const fixture = TestBed.createComponent(MailBlockLibrary);
    fixture.detectChanges();
    const picked: LibraryItemKey[] = [];
    fixture.componentInstance.picked.subscribe((key) => picked.push(key));
    const buttons = fixture.nativeElement.querySelectorAll('[data-library-item]');
    expect(buttons.length).toBe(LIBRARY_ITEMS.length);
    fixture.nativeElement.querySelector('[data-library-item="columns-3"]').click();
    expect(picked).toEqual(['columns-3']);
  });
});
