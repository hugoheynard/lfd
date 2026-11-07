import { describe, expect, it } from 'vitest';

import { sectionText } from '../mail-text.testing';
import { FRAME_LABELS, textHeading } from './mail-sections';

describe('les cadres et les textes d’un e-mail', () => {
  it('nomme les deux cadres immobiles', () => {
    expect(FRAME_LABELS).toEqual({ subject: 'Objet', header: 'En-tête' });
  });

  it('nomme un texte par sa variante, rien s’il est seul, son chemin sinon', () => {
    expect(textHeading(sectionText('title.paid', 'Commande payée'), 2)).toBe('Commande payée');
    expect(textHeading(sectionText('title'), 1)).toBeNull();
    expect(textHeading(sectionText('cta'), 2)).not.toBeNull();
  });
});
