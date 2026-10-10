import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { AltTextPanel, type AltTextPanelData } from './alt-text-panel';

const SENTENCE = "Cet usage n'est publié sur aucun canal";

function render(data: AltTextPanelData): HTMLElement {
  TestBed.configureTestingModule({
    providers: [{ provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) }],
  });
  const fixture = TestBed.createComponent(AltTextPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AltTextPanel — usage non publié', () => {
  it("dit qu'un usage en galerie n'est publié nulle part", () => {
    expect(render({ url: '', role: 'gallery' }).textContent).toContain(SENTENCE);
  });

  it("se tait sur l'ouverture", () => {
    expect(render({ url: '', role: 'hero' }).textContent).not.toContain(SENTENCE);
  });

  it('se tait quand le porteur n’a pas la notion de rôle', () => {
    expect(render({ url: '' }).textContent).not.toContain(SENTENCE);
  });
});
