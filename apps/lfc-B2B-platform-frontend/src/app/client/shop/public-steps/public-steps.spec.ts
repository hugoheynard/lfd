import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PublicSteps, type StepRank } from './public-steps';

function boot(
  current: StepRank,
  answers: readonly (string | null)[] = [],
): ComponentFixture<PublicSteps> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [PublicSteps] });
  const fixture = TestBed.createComponent(PublicSteps);
  fixture.componentRef.setInput('current', current);
  fixture.componentRef.setInput('answers', answers);
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<PublicSteps>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const steps = (fixture: ComponentFixture<PublicSteps>): readonly Element[] => [
  ...el(fixture).querySelectorAll('.step'),
];

const textOf = (node: Element | null | undefined, selector: string): string =>
  node?.querySelector(selector)?.textContent?.trim() ?? '';

describe('PublicSteps', () => {
  it('rend les trois étapes, quel que soit l’endroit où l’on en est', () => {
    expect(steps(boot(1))).toHaveLength(3);
    expect(steps(boot(3))).toHaveLength(3);
  });

  it('marque l’étape courante, et elle seule', () => {
    const marked = steps(boot(2)).filter((step) => step.classList.contains('is-current'));

    expect(marked).toHaveLength(1);
    expect(textOf(marked[0], '.step-label')).toBe('À quelle heure');
  });

  /**
   * 🔴 La coche REMPLACE le rang. Le numéro servait à situer ; une fois la
   * réponse donnée il n'a plus d'usage, et c'est la coche qui porte le sens.
   */
  it('remplace le rang par une coche sur les étapes franchies', () => {
    const rendered = steps(boot(3));

    expect(textOf(rendered[0], '.step-mark')).toBe('✓');
    expect(textOf(rendered[1], '.step-mark')).toBe('✓');
    expect(textOf(rendered[2], '.step-mark')).toBe('3');
  });

  /**
   * Régression : rien n'est franchi d'office. Sur l'accueil, la première étape
   * est courante et aucune n'est franchie — une coche sur un choix qui n'a pas
   * eu lieu serait un mensonge.
   */
  it('ne coche RIEN quand on est à la première étape', () => {
    const rendered = steps(boot(1));

    expect(el(boot(1)).querySelectorAll('.tick')).toHaveLength(0);
    expect(textOf(rendered[0], '.step-mark')).toBe('1');
  });

  /** Une étape franchie s'annoncerait comme les autres si la coche était muette. */
  it('nomme la coche pour un lecteur d’écran', () => {
    const tick = el(boot(2)).querySelector('.tick');

    expect(tick?.getAttribute('aria-label')).toBe('Étape franchie');
  });

  /**
   * 🔴 Une réponse REMPLACE la promesse : « la maison qui vous arrange » dit à
   * quoi sert l'étape, « Le Labo » rappelle ce qu'on a décidé — et c'est ce
   * qu'on vient vérifier en levant les yeux.
   */
  it('affiche la réponse à la place de la promesse, quand il y en a une', () => {
    const rendered = steps(boot(3, ['Le Labo', 'demain 7 h 15']));

    expect(textOf(rendered[0], '.step-hint')).toBe('Le Labo');
    expect(textOf(rendered[1], '.step-hint')).toBe('demain 7 h 15');
  });

  it('garde la promesse des étapes qui n’ont rien à rappeler', () => {
    const rendered = steps(boot(3, ['Le Labo', 'demain 7 h 15']));

    expect(textOf(rendered[2], '.step-hint')).toBe('La boutique est ouverte');
  });

  /** Un trou dans les réponses n'efface pas la promesse : `null` n'est pas « vide ». */
  it('retombe sur la promesse là où la réponse manque', () => {
    const rendered = steps(boot(2, [null]));

    expect(textOf(rendered[0], '.step-hint')).toBe('La maison qui vous arrange');
  });
});
