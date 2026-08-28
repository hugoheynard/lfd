import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FoldWellComponent } from './fold-well';

@Component({
  imports: [FoldWellComponent],
  template: `
    <fold-well [title]="title()" [scrollable]="scrollable()" subtitle="3 en cours">
      <span wellLead class="lead">L</span>
      <span class="item">A</span>
      <span class="item">B</span>
    </fold-well>
  `,
})
class Host {
  // Des SIGNAUX et pas des champs nus : l'app est zoneless, et une propriété
  // muette ne salit aucune vue — le gabarit ne se recalculerait jamais.
  readonly title = signal('Mes suivis');
  readonly scrollable = signal(false);
  readonly well = viewChild.required(FoldWellComponent);
}

describe('FoldWellComponent', () => {
  let fixture: ComponentFixture<Host>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const well = (): HTMLElement => el().querySelector('fold-well') as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('porte son titre et ce qui identifie le lot', () => {
    expect(el().textContent).toContain('Mes suivis');
    expect(el().querySelector('.lead')).not.toBeNull();
  });

  it('sans titre, PAS de tête — une barre de titre vide est pire que pas de tête', () => {
    fixture.componentInstance.title.set('');
    fixture.detectChanges();
    expect(el().querySelector('header')).toBeNull();
    // Le contenu, lui, reste : la tête est une option, pas une condition.
    expect(el().querySelectorAll('.item').length).toBe(2);
  });

  it('n’est un rail que si on le lui demande', () => {
    // Un puits qui défile sans raison vole le défilement de la page sous le
    // pouce, et la carte qu'on touche n'est plus celle qui bouge.
    expect(well().hasAttribute('data-scrollable')).toBe(false);
    fixture.componentInstance.scrollable.set(true);
    fixture.detectChanges();
    expect(well().hasAttribute('data-scrollable')).toBe(true);
  });

  it('tient sa position lui-même, à partir du premier item', () => {
    // C'est ce qui permet à un indicateur de n'avoir aucun code dans la page :
    // il se branche sur le puits par une référence de gabarit.
    expect(fixture.componentInstance.well().active()).toBe(0);
  });

  it('ignore un index hors du lot plutôt que de le ramener au bord', () => {
    // Un rabotage silencieux masque un appelant qui compte autre chose.
    expect(() => fixture.componentInstance.well().goTo(9)).not.toThrow();
    expect(fixture.componentInstance.well().active()).toBe(0);
  });
});
