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

  it('montre la vignette d’une image et écrit son texte de remplacement', () => {
    const { fixture, emitted } = render({
      id: 'i',
      kind: 'image',
      src: 'https://m.fr/a.webp',
      alt: {},
    });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[data-thumbnail]')?.getAttribute('src')).toBe(
      'https://m.fr/a.webp',
    );
    expect(element.textContent).toContain('Texte de remplacement (EN)');
    const field: HTMLInputElement = element.querySelector('input')!;
    field.value = 'A brioche';
    field.dispatchEvent(new Event('input'));
    expect(emitted).toEqual([
      { id: 'i', kind: 'image', src: 'https://m.fr/a.webp', alt: { en: 'A brioche' } },
    ]);
  });

  it('ne demande aucun texte à une image décorative, ni de vignette avant le choix', () => {
    const { fixture } = render({ id: 'i', kind: 'image', src: '', alt: {}, decorative: true });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('input')).toBeNull();
    expect(element.querySelector('[data-thumbnail]')).toBeNull();
    expect(element.querySelector('[data-decorative-note]')).not.toBeNull();
  });
});
