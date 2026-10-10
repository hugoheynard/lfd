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

function panel(data: ImagePanelData): {
  panel: ImagePanel;
  closed: ImagePanelResult[];
  dismissed: () => number;
} {
  const closed: ImagePanelResult[] = [];
  let dismissals = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: FoldPanelRef,
        useValue: {
          close: (result?: ImagePanelResult): void => {
            dismissals += 1;
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
  return { panel: fixture.componentInstance, closed, dismissed: () => dismissals };
}

const bare: ImagePanelData = {
  url: URL,
  name: '',
  alt: { fr: URL },
  focal: null,
  tags: [],
  vocabulary: [],
};

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

describe('décrire une image — les mots-clés', () => {
  const tagged: ImagePanelData = {
    ...bare,
    tags: ['croissant'],
    vocabulary: ['beurre', 'croissant', 'pain au chocolat', 'chocolatine'],
  };

  it('ajoute la saisie normalisée, et la rend avec le reste', () => {
    const { panel: screen, closed } = panel(tagged);

    screen['tagDraft'].set('  Beurre ');
    expect(screen['tagWritten']()).toBe('beurre');
    screen['addTag'](screen['tagDraft']());
    screen['submit']();

    expect(closed[0]?.tags).toEqual(['croissant', 'beurre']);
    expect(screen['tagDraft']()).toBe('');
  });

  it('ne double pas un mot déjà porté, et ignore une saisie vide', () => {
    const { panel: screen } = panel(tagged);

    screen['addTag']('Croissant');
    screen['addTag']('   ');

    expect(screen['tags']()).toEqual(['croissant']);
  });

  it('retire un mot', () => {
    const { panel: screen, closed } = panel(tagged);

    screen['removeTag']('croissant');
    screen['submit']();

    expect(closed[0]?.tags).toEqual([]);
  });

  it('propose les mots existants qui contiennent la saisie, hors ceux portés', () => {
    const { panel: screen } = panel(tagged);

    screen['tagDraft'].set('CHOC');
    expect(screen['suggestions']()).toEqual(['pain au chocolat', 'chocolatine']);

    screen['tagDraft'].set('crois');
    expect(screen['suggestions']()).toEqual([]);

    screen['tagDraft'].set('');
    expect(screen['suggestions']()).toEqual([]);
  });
});

describe('décrire une image — le cadrage', () => {
  it('centre les recadrages tant qu’aucun point n’est posé', () => {
    const { panel: screen } = panel(bare);

    expect(screen['objectPosition']()).toBe('50% 50%');
  });

  it('fait suivre le point aux recadrages', () => {
    const { panel: screen } = panel({ ...bare, focal: { x: 0.2, y: 0.75 } });
    expect(screen['objectPosition']()).toBe('20% 75%');

    screen['unpoint']();

    expect(screen['objectPosition']()).toBe('50% 50%');
  });
});

describe('décrire une image — le texte alternatif', () => {
  it('compte les caractères, et avertit au-delà de 125 sans bloquer', () => {
    const { panel: screen, closed } = panel(bare);

    screen['write']('fr', 'a'.repeat(125));
    expect(screen['lengthOf']('fr')).toBe(125);
    expect(screen['tooLong']('fr')).toBe(false);

    screen['write']('fr', 'a'.repeat(126));
    expect(screen['tooLong']('fr')).toBe(true);
    screen['submit']();

    expect(closed[0]?.alt.fr).toHaveLength(126);
  });

  it('affiche le repli sur l’URL comme un champ vide, compté zéro', () => {
    const { panel: screen } = panel(bare);

    expect(screen['valueOf']('fr')).toBe('');
    expect(screen['lengthOf']('fr')).toBe(0);
    // Ouvrir une image non décrite n'est pas la modifier.
    expect(screen['dirty']()).toBe(false);
  });
});

describe('décrire une image — enregistrer et partir', () => {
  it('n’active Enregistrer qu’une fois quelque chose changé', () => {
    const { panel: screen, closed } = panel({ ...bare, name: 'Croissant' });
    expect(screen['dirty']()).toBe(false);
    screen['submit']();
    expect(closed).toEqual([]);

    screen['label'].set('Croissant beurre');
    expect(screen['dirty']()).toBe(true);

    screen['label'].set('Croissant');
    expect(screen['dirty']()).toBe(false);
  });

  it('ferme sans demander quand rien n’a changé', () => {
    const { panel: screen, dismissed } = panel(bare);

    screen['cancel']();

    expect(dismissed()).toBe(1);
  });

  it('demande avant de jeter une saisie, et la garde si l’on continue', () => {
    const { panel: screen, dismissed } = panel(bare);
    screen['addTag']('beurre');

    screen['cancel']();
    expect(screen['leaving']()).toBe(true);
    expect(dismissed()).toBe(0);

    screen['keepEditing']();
    expect(screen['tags']()).toEqual(['beurre']);

    screen['cancel']();
    screen['discard']();
    expect(dismissed()).toBe(1);
  });
});

describe('décrire une image — la série', () => {
  const images = ['a', 'b', 'c'].map((key) => ({
    ...bare,
    url: `https://media.test/${key}.png`,
    alt: { fr: `https://media.test/${key}.png` },
    name: key,
  }));

  function image(at: number): ImagePanelData {
    const found = images[at];
    if (found === undefined) {
      throw new Error(`pas d'image ${String(at)}`);
    }
    return found;
  }

  function serie(at: number, save: (result: ImagePanelResult) => Promise<boolean>) {
    const saved: ImagePanelResult[] = [];
    const opened = panel({
      ...image(at),
      sequence: {
        images: () => images,
        save: (result) => {
          saved.push(result);
          return save(result);
        },
      },
    });
    return { ...opened, saved };
  }

  it('passe à la suivante et à la précédente, bornées aux deux bouts', async () => {
    const { panel: screen, saved } = serie(0, () => Promise.resolve(true));
    expect(screen['previous']()).toBeNull();

    await screen['go']('next');
    expect(screen['shown']()?.url).toBe(image(1).url);
    expect(screen['label']()).toBe('b');

    await screen['go']('previous');
    expect(screen['shown']()?.url).toBe(image(0).url);
    // Rien n'avait changé : rien n'est écrit en passant.
    expect(saved).toEqual([]);
  });

  it('enregistre la saisie avant de passer, sous l’URL de l’image quittée', async () => {
    const { panel: screen, saved } = serie(1, () => Promise.resolve(true));
    screen['label'].set('Baguette');

    await screen['go']('next');

    expect(saved).toEqual([expect.objectContaining({ url: image(1).url, name: 'Baguette' })]);
    expect(screen['shown']()?.url).toBe(image(2).url);
    expect(screen['dirty']()).toBe(false);
  });

  it('reste sur l’image, saisie intacte, quand l’écriture est refusée', async () => {
    const { panel: screen } = serie(1, () => Promise.resolve(false));
    screen['label'].set('Baguette');

    await screen['go']('next');

    expect(screen['shown']()?.url).toBe(image(1).url);
    expect(screen['label']()).toBe('Baguette');
  });

  it('suit les flèches du clavier hors d’un champ, pas dedans', () => {
    const { panel: screen } = serie(0, () => Promise.resolve(true));
    const field = document.createElement('input');
    field.addEventListener('keydown', (event) => {
      screen['onKey'](event);
    });
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(screen['shown']()?.url).toBe(image(0).url);

    const elsewhere = document.createElement('div');
    elsewhere.addEventListener('keydown', (event) => {
      screen['onKey'](event);
    });
    elsewhere.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(screen['shown']()?.url).toBe(image(1).url);
  });
});

describe('décrire une image — les informations', () => {
  it('met en forme format, dimensions, poids, date de Paris, fichier et emplois', () => {
    const { panel: screen } = panel({
      ...bare,
      facts: {
        width: 4808,
        height: 3205,
        bytes: 2_516_582,
        contentType: 'image/jpeg',
        // 22 h UTC un 23 septembre = minuit le 24 à Paris.
        depositedAt: '2026-09-23T22:00:00.000Z',
        uses: 2,
      },
    });

    const info = screen['facts']();
    expect(info).toMatchObject({
      format: 'JPEG',
      dimensions: '4808 × 3205 px',
      weight: '2,4 Mo',
      fileName: 'abc.png',
      usesWording: '2 emplois',
    });
    expect(info?.depositedAt).toContain('24 septembre 2026');
    expect(info?.depositedAt).toContain('00:00');
  });

  it('dit les kilo-octets sous le méga, et ne mesure pas ce qui manque', () => {
    const { panel: screen } = panel({
      ...bare,
      facts: {
        width: null,
        height: null,
        bytes: 251_187,
        contentType: null,
        depositedAt: '2026-09-23T08:00:00.000Z',
        uses: 0,
      },
    });

    expect(screen['facts']()).toMatchObject({
      format: null,
      dimensions: null,
      weight: '245,3 Ko',
      usesWording: 'Inutilisée',
    });
  });
});
