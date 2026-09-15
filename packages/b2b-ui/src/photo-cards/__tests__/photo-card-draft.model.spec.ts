import {
  canAddCard,
  EMPTY_PHOTO_CARD_DRAFT,
  isPhotoCardDraftChanged,
  movedCardIds,
  newPhotoOf,
  photoCardChangeOf,
  photoCardDraftFrom,
  photoCardIssueOf,
  toPhotoCardFields,
  type PhotoCardLimits,
} from '../photo-card-draft.model';
import type { PhotoCardView } from '../photo-cards.gateway';

/**
 * Le socle ne connaît aucune borne : ces tests en posent de délibérément
 * éloignées de la procédure (80 / 1000 / 20), pour qu'une valeur recopiée en
 * dur dans le socle se voie ici plutôt qu'à la mise en service des notes.
 */
const LIMITS: PhotoCardLimits = { titleMax: 5, bodyMax: 12, maxCards: 3 };

function card(id: string, over: Partial<PhotoCardView> = {}): PhotoCardView {
  return { id, title: `Carte ${id}`, body: '', photoRevision: null, ...over };
}

const PHOTO = { size: 1 } as Blob;

describe('le brouillon d’une carte photo', () => {
  it('se préremplit depuis la carte, photo reconnue à sa révision', () => {
    expect(
      photoCardDraftFrom(card('a', { title: 'Note', body: 'Rappeler', photoRevision: 'r1' })),
    ).toEqual({
      title: 'Note',
      body: 'Rappeler',
      photo: { kind: 'kept', revision: 'r1' },
    });
    expect(photoCardDraftFrom(card('b')).photo).toEqual({ kind: 'none' });
  });

  describe('reproches, aux bornes passées', () => {
    it('exige un titre, espaces seuls compris', () => {
      expect(photoCardIssueOf({ ...EMPTY_PHOTO_CARD_DRAFT, title: '  ' }, LIMITS)).toBe(
        'title-required',
      );
    });

    it('mesure le titre après trim, à la borne donnée', () => {
      expect(photoCardIssueOf({ ...EMPTY_PHOTO_CARD_DRAFT, title: ' abcde ' }, LIMITS)).toBe('');
      expect(photoCardIssueOf({ ...EMPTY_PHOTO_CARD_DRAFT, title: 'abcdef' }, LIMITS)).toBe(
        'title-too-long',
      );
    });

    it('borne le texte à la borne donnée', () => {
      const draft = { ...EMPTY_PHOTO_CARD_DRAFT, title: 'Note' };
      expect(photoCardIssueOf({ ...draft, body: ` ${'a'.repeat(12)} ` }, LIMITS)).toBe('');
      expect(photoCardIssueOf({ ...draft, body: 'a'.repeat(13) }, LIMITS)).toBe('body-too-long');
    });

    it('une autre borne change le verdict sur le même brouillon', () => {
      const draft = { ...EMPTY_PHOTO_CARD_DRAFT, title: 'abcdef' };
      expect(photoCardIssueOf(draft, { ...LIMITS, titleMax: 6 })).toBe('');
    });
  });

  it('envoie des champs nettoyés, et la photo neuve seulement', () => {
    expect(
      toPhotoCardFields({ title: ' Note ', body: ' Texte \n', photo: { kind: 'none' } }),
    ).toEqual({
      title: 'Note',
      body: 'Texte',
    });
    expect(newPhotoOf({ ...EMPTY_PHOTO_CARD_DRAFT, photo: { kind: 'picked', photo: PHOTO } })).toBe(
      PHOTO,
    );
    expect(
      newPhotoOf({ ...EMPTY_PHOTO_CARD_DRAFT, photo: { kind: 'kept', revision: 'r1' } }),
    ).toBeNull();
  });

  describe('ce qu’on fait de la photo d’une carte refaite', () => {
    const initial = photoCardDraftFrom(card('a', { photoRevision: 'r1' }));

    it('n’y touche pas quand seul le texte change', () => {
      expect(photoCardChangeOf({ ...initial, body: 'autre' }, initial)).toEqual({ kind: 'keep' });
    });

    it('la remplace, ou la retire', () => {
      expect(
        photoCardChangeOf({ ...initial, photo: { kind: 'picked', photo: PHOTO } }, initial),
      ).toEqual({
        kind: 'replace',
        photo: PHOTO,
      });
      expect(photoCardChangeOf({ ...initial, photo: { kind: 'none' } }, initial)).toEqual({
        kind: 'remove',
      });
    });

    it('ne demande pas de retirer une photo qui n’existait pas', () => {
      const bare = photoCardDraftFrom(card('b'));
      expect(photoCardChangeOf(bare, bare)).toEqual({ kind: 'keep' });
    });
  });

  it('n’est modifié que par un vrai changement', () => {
    const initial = photoCardDraftFrom(card('a', { title: 'Note', photoRevision: 'r1' }));
    expect(isPhotoCardDraftChanged({ ...initial, title: 'Note  ' }, initial)).toBe(false);
    expect(isPhotoCardDraftChanged({ ...initial, photo: { kind: 'none' } }, initial)).toBe(true);
    expect(
      isPhotoCardDraftChanged({ ...initial, photo: { kind: 'picked', photo: PHOTO } }, initial),
    ).toBe(true);
  });
});

describe('déplacer une carte', () => {
  const cards = [card('a'), card('b'), card('c')];

  it('échange avec la voisine et rend TOUS les identifiants', () => {
    expect(movedCardIds(cards, 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(movedCardIds(cards, 'c', -1)).toEqual(['a', 'c', 'b']);
  });

  it('refuse de sortir des bornes, ou une carte inconnue', () => {
    expect(movedCardIds(cards, 'a', -1)).toBeNull();
    expect(movedCardIds(cards, 'c', 1)).toBeNull();
    expect(movedCardIds(cards, 'z', -1)).toBeNull();
  });
});

it('on ajoute jusqu’à la borne passée, pas une carte de plus', () => {
  expect(canAddCard(2, LIMITS)).toBe(true);
  expect(canAddCard(3, LIMITS)).toBe(false);
  expect(canAddCard(3, { ...LIMITS, maxCards: 50 })).toBe(true);
});
