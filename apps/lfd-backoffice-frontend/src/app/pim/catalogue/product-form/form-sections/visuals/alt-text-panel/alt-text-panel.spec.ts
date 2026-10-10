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

describe('AltTextPanel — format signalé', () => {
  const WARNING = 'fold-callout[variant="warning"]';

  it("signale un 3/2 choisi pour l'ouverture, sans rien refuser", () => {
    const host = render({ url: '', role: 'hero', width: 3000, height: 2000 });
    expect(host.querySelector(WARNING)?.textContent).toContain(
      "Cette image est en 3/2 (≈ 1,50), l'ouverture attend du 4/3 (1,33) : un bord sera coupé.",
    );
    expect(host.querySelector('button[disabled]')).toBeNull();
  });

  it('se tait quand le format convient', () => {
    expect(
      render({ url: '', role: 'hero', width: 1600, height: 1200 }).querySelector(WARNING),
    ).toBeNull();
  });

  it("se tait en galerie, qui n'attend aucun format", () => {
    expect(
      render({ url: '', role: 'gallery', width: 3000, height: 1000 }).querySelector(WARNING),
    ).toBeNull();
  });

  it('se tait sur une image non mesurée', () => {
    expect(render({ url: '', role: 'hero' }).querySelector(WARNING)).toBeNull();
  });
});
