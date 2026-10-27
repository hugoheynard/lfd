import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import { CompletionSheet, type CompletionSheetData } from './completion-sheet';

const DATA: CompletionSheetData = {
  title: '1 élément à compléter',
  optionalNote: 'n’empêche pas l’activation',
  steps: [
    {
      key: 'kbis',
      title: 'Extrait KBIS',
      detail: 'Déposez l’extrait KBIS de votre entreprise.',
      cta: 'Déposer le KBIS',
      kind: 'action',
    },
  ],
};

let closedWith: unknown[];

function boot(): ComponentFixture<CompletionSheet> {
  closedWith = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CompletionSheet],
    providers: [{ provide: FoldPanelRef, useValue: { close: (v: unknown) => closedWith.push(v) } }],
  });
  const fixture = TestBed.createComponent(CompletionSheet);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  return fixture;
}

describe('CompletionSheet', () => {
  it('montre la liste et rend la clé de l’étape dont on touche le bouton', () => {
    const el = boot().nativeElement as HTMLElement;

    expect(el.textContent).toContain('Extrait KBIS');
    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Déposer le KBIS'),
    );
    button?.click();

    expect(closedWith).toEqual(['kbis']);
  });
});
