import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { ImagePanel, type ImagePanelData, type ImagePanelResult } from './image-panel';

/**
 * Ce que ces cas tiennent : **le panneau ne fait pas passer un repli pour une
 * phrase**, et le point focal se pose en fractions.
 *
 * Quand personne n'a écrit d'alternative, le serveur rend l'URL — c'est ce qui
 * la fait se VOIR. L'afficher dans le champ ferait croire à une description
 * rédigée, et la première sauvegarde la figerait pour de bon.
 */

const URL = 'https://media.test/products/abc.png';

function panel(data: ImagePanelData): { panel: ImagePanel; closed: ImagePanelResult[] } {
  const closed: ImagePanelResult[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: FoldPanelRef,
        useValue: {
          close: (result?: ImagePanelResult): void => {
            if (result !== undefined) {
              closed.push(result);
            }
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ImagePanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return { panel: fixture.componentInstance, closed };
}

const bare: ImagePanelData = { url: URL, name: '', alt: { fr: URL }, focal: null };

describe('décrire une image', () => {
  it('n’affiche PAS l’URL de repli comme si c’était une alternative', () => {
    const { panel: screen } = panel(bare);

    expect(screen['valueOf']('fr')).toBe('');
  });

  it('affiche une alternative vraiment écrite', () => {
    const { panel: screen } = panel({ ...bare, alt: { fr: 'Croissant doré' } });

    expect(screen['valueOf']('fr')).toBe('Croissant doré');
  });

  it('rend une source vide plutôt qu’un texte creux', () => {
    const { panel: screen, closed } = panel({ ...bare, alt: { fr: 'Croissant', en: 'Croissant' } });
    screen['write']('fr', '   ');

    screen['submit']();

    // Le serveur retombera sur l'URL, qui se voit. Une chaîne vide passerait
    // pour une description rédigée auprès de tout ce qui compte les langues.
    expect(closed[0]?.alt).toEqual({ fr: '' });
  });

  it('écrit une langue sans effacer les autres', () => {
    const { panel: screen, closed } = panel({ ...bare, alt: { fr: 'Croissant' } });

    screen['write']('it', 'Cornetto');
    screen['submit']();

    expect(closed[0]?.alt).toEqual({ fr: 'Croissant', it: 'Cornetto' });
  });

  /**
   * Un VRAI clic sur un VRAI élément, et pas un objet qui ressemble à un
   * événement : `currentTarget` n'est posé que pendant la propagation, et un
   * doublé le fournirait à un endroit où le navigateur ne le fait pas. Le
   * dépôt refuse d'ailleurs le cast qui l'aurait permis.
   */
  function clickAt(
    screen: ImagePanel,
    box: { left: number; top: number; width: number; height: number },
    at: { x: number; y: number },
  ): void {
    const target = document.createElement('span');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: box.left, y: box.top, width: box.width, height: box.height }),
    );
    target.addEventListener('click', (event) => {
      screen['point'](event);
    });
    target.dispatchEvent(new MouseEvent('click', { clientX: at.x, clientY: at.y }));
  }

  /**
   * En FRACTIONS, jamais en pixels : l'image est recadrée à des tailles qu'on
   * ne connaît pas, et une coordonnée absolue ne voudrait plus rien dire une
   * fois la vignette produite.
   */
  it('pose le point en fractions de l’aperçu', () => {
    const { panel: screen, closed } = panel(bare);

    clickAt(screen, { left: 100, top: 50, width: 400, height: 200 }, { x: 200, y: 100 });
    screen['submit']();

    expect(closed[0]?.focal).toEqual({ x: 0.25, y: 0.25 });
  });

  it('borne un clic qui déborde du cadre', () => {
    const { panel: screen, closed } = panel(bare);

    clickAt(screen, { left: 0, top: 0, width: 100, height: 100 }, { x: 140, y: -20 });
    screen['submit']();

    expect(closed[0]?.focal).toEqual({ x: 1, y: 0 });
  });

  it('retire le point sans le remplacer par le centre', () => {
    const { panel: screen, closed } = panel({ ...bare, focal: { x: 0.2, y: 0.8 } });

    screen['unpoint']();
    screen['submit']();

    // `null` veut dire « personne ne s'est prononcé ». Le centre est un choix
    // comme un autre, et les confondre retirerait le moyen de ne pas décider.
    expect(closed[0]?.focal).toBeNull();
  });
});
