import { TestBed } from '@angular/core/testing';
import type { FreeBlock } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { MailFreeBlockEditor } from './mail-free-block-editor';

function render(block: FreeBlock) {
  const fixture = TestBed.createComponent(MailFreeBlockEditor);
  fixture.componentRef.setInput('block', block);
  fixture.componentRef.setInput('locale', 'en');
  fixture.detectChanges();
  const emitted: FreeBlock[] = [];
  fixture.componentInstance.blockChange.subscribe((next) => emitted.push(next));
  return { fixture, emitted };
}

describe('MailFreeBlockEditor', () => {
  it('écrit le texte dans la langue choisie et garde les autres', () => {
    const { fixture, emitted } = render({ id: 'p', kind: 'paragraph', text: { fr: 'Bonjour' } });
    const field: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    field.value = 'Hello';
    field.dispatchEvent(new Event('input'));
    expect(emitted).toEqual([{ id: 'p', kind: 'paragraph', text: { fr: 'Bonjour', en: 'Hello' } }]);
  });

  it('écrit le libellé d’un bouton sur une ligne', () => {
    const { fixture, emitted } = render({ id: 'b', kind: 'button', label: {}, href: '' });
    const field: HTMLInputElement = fixture.nativeElement.querySelector('input');
    field.value = 'See';
    field.dispatchEvent(new Event('input'));
    expect(emitted[0]).toMatchObject({ label: { en: 'See' } });
  });

  it('n’offre aucun champ pour un séparateur', () => {
    const { fixture } = render({ id: 'd', kind: 'divider' });
    expect(fixture.nativeElement.querySelector('input, textarea')).toBeNull();
  });
});
