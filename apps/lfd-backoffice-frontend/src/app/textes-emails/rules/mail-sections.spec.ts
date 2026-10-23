import { describe, expect, it } from 'vitest';

import { mailTextView, mailView, sectionText, sectionView } from '../mail-copy.testing';
import {
  canResetOrder,
  locateInPreview,
  movedOrder,
  textHeading,
  unplacedTexts,
} from './mail-sections';

const MAIL = mailView(
  'customer.order-placed',
  [
    mailTextView('customer.order-placed', 'subject', 'Commande {ref}'),
    mailTextView('customer.order-placed', 'headerTitle', 'Merci'),
    mailTextView('customer.order-placed', 'title.paid', 'Payée'),
    mailTextView('customer.order-placed', 'title.due', 'À régler'),
    mailTextView('customer.order-placed', 'qrAlt', 'QR'),
  ],
  {
    frames: { subject: [sectionText('subject')], header: [sectionText('headerTitle')] },
    sections: [
      sectionView('title', 'Titre', 0, [
        sectionText('title.paid', 'Commande payée par carte'),
        sectionText('title.due', 'Commande à régler'),
      ]),
      sectionView('summary', 'Récapitulatif', 1, [], 'system'),
    ],
  },
);

describe('les sections d’un e-mail', () => {
  it('monte et descend d’un cran, et refuse de sortir de la liste', () => {
    expect(movedOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(movedOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(movedOrder(['a', 'b'], 'a', -1)).toBeNull();
    expect(movedOrder(['a', 'b'], 'b', 1)).toBeNull();
    expect(movedOrder(['a'], 'z', 1)).toBeNull();
  });

  it('un ordre se rétablit s’il est en brouillon ou publié hors du code', () => {
    const base = MAIL.sectionOrder;
    expect(canResetOrder(base)).toBe(false);
    expect(canResetOrder({ ...base, draftState: 'set', draft: ['summary', 'title'] })).toBe(true);
    expect(canResetOrder({ ...base, published: ['summary', 'title'] })).toBe(true);
    expect(canResetOrder({ ...base, draftState: 'reset', published: ['summary', 'title'] })).toBe(
      false,
    );
  });

  it('nomme un texte par sa variante, rien s’il est seul, son chemin sinon', () => {
    expect(textHeading(sectionText('title.paid', 'Commande payée'), 2)).toBe('Commande payée');
    expect(textHeading(sectionText('title'), 1)).toBeNull();
    expect(textHeading(sectionText('cta'), 2)).not.toBeNull();
  });

  it('garde éditables les textes qu’aucune carte ne range', () => {
    expect(unplacedTexts(MAIL).map((text) => text.path)).toEqual(['qrAlt']);
  });

  describe('un clic dans l’aperçu désigne une carte', () => {
    it('un texte de l’e-mail : sa carte et lui', () => {
      expect(locateInPreview(MAIL, 'title', 'title.due', MAIL.mail)).toEqual({
        card: 'section:title',
        path: 'title.due',
      });
    });

    it('un texte de l’en-tête : le cadre, qui n’a pas de section', () => {
      expect(locateInPreview(MAIL, null, 'headerTitle', MAIL.mail)).toEqual({
        card: 'frame:header',
        path: 'headerTitle',
      });
    });

    it('un texte emprunté à un autre e-mail : sa section seulement', () => {
      expect(locateInPreview(MAIL, 'summary', 'title.due', 'customer.other')).toEqual({
        card: 'section:summary',
        path: null,
      });
    });

    it('hors de toute section connue : rien', () => {
      expect(locateInPreview(MAIL, null, null, null)).toBeNull();
      expect(locateInPreview(MAIL, 'inconnue', null, null)).toBeNull();
    });
  });
});
