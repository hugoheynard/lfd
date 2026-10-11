import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AltDraft } from '../../state/alt-draft';
import { AltSection } from './alt-section';

function render(draft: AltDraft): () => string {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(AltSection);
  fixture.componentRef.setInput('draft', draft);
  fixture.detectChanges();
  return () => {
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    return element.textContent ?? '';
  };
}

describe('le texte alternatif', () => {
  it('dit qu’une source vide n’est pas décrite, et qu’une traduction vide retombe', () => {
    const text = render(new AltDraft());

    expect(text()).toContain('Pas encore décrite.');
    expect(text()).toContain('Retombe sur le français.');
  });

  it('suit la saisie confiée : la source fait foi, son compte se lit', () => {
    const draft = new AltDraft();
    const text = render(draft);

    draft.write('fr', 'Croissant doré');

    expect(text()).toContain('Le français fait foi.');
    expect(text()).toContain('14 / 125');
  });
});
