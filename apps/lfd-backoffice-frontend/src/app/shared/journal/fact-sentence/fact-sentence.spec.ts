import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { FoldLinkComponent } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import type { Segment } from '../phrase';
import { FactSentence } from './fact-sentence';

/**
 * **Une phrase du journal, à l'écran** : ses espaces tels que le moteur les a
 * écrits, les noms en gras, et le sujet lié à sa fiche quand il en a une.
 */
function mount(segments: readonly Segment[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(FactSentence);
  fixture.componentRef.setInput('segments', segments);
  fixture.detectChanges();
  return fixture;
}

describe('FactSentence', () => {
  it('rend la phrase mot pour mot, les noms en gras, sans HTML injecté', () => {
    const fixture = mount([
      { kind: 'text', text: 'Taux de TVA « ' },
      { kind: 'name', text: '<b>Réduit</b>' },
      { kind: 'text', text: ' » créé à ' },
      { kind: 'value', text: '5,5 %' },
    ]);
    const host: HTMLElement = fixture.nativeElement;

    expect(host.textContent).toBe('Taux de TVA « <b>Réduit</b> » créé à 5,5 %');
    expect(host.querySelector('strong')?.textContent).toBe('<b>Réduit</b>');
    expect(host.querySelector('b')).toBeNull();
  });

  it('lie le sujet à sa fiche, et navigue dans l’application au clic', () => {
    const fixture = mount([
      { kind: 'text', text: 'Fait enregistré sur la fiche « ' },
      { kind: 'subject', text: 'Tarte citron', route: '/pim/produits/prd_42' },
      { kind: 'text', text: ' »' },
    ]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const link = fixture.debugElement.query(By.directive(FoldLinkComponent));
    link.injector.get(FoldLinkComponent).clicked.emit(new MouseEvent('click'));

    expect(link.nativeElement.textContent).toContain('Tarte citron');
    expect(navigate).toHaveBeenCalledWith('/pim/produits/prd_42');
  });

  it('met en gras sans lien un sujet qui n’a pas de fiche', () => {
    const fixture = mount([{ kind: 'subject', text: 'Jean Dupont', route: null }]);

    expect(fixture.debugElement.query(By.directive(FoldLinkComponent))).toBeNull();
    expect(fixture.nativeElement.querySelector('strong')?.textContent).toBe('Jean Dupont');
  });
});
