import {
  DELIVERY_PROCEDURE_MAX_STEPS,
  DELIVERY_STEP_BODY_MAX,
  DELIVERY_STEP_TITLE_MAX,
  type DeliveryProcedureStepView,
} from '@lfd/contracts';

import {
  canAddStep,
  EMPTY_DELIVERY_STEP_DRAFT,
  isStepDraftChanged,
  movedStepIds,
  newStepPhotoOf,
  photoChangeOf,
  stepDraftFrom,
  stepIssueOf,
  toStepFields,
} from '../delivery-step-draft.model';

function step(
  id: string,
  over: Partial<DeliveryProcedureStepView> = {},
): DeliveryProcedureStepView {
  return { id, number: 1, title: `Titre ${id}`, body: '', photoRevision: null, ...over };
}

const PHOTO = { size: 1 } as Blob;
const PORTAIL = step('s1', { title: 'Portail', body: 'Code 4512', photoRevision: 'rev1' });

describe('le brouillon d’une étape', () => {
  it('se préremplit depuis l’étape, photo reconnue à sa révision', () => {
    expect(stepDraftFrom(PORTAIL)).toEqual({
      title: 'Portail',
      body: 'Code 4512',
      photo: { kind: 'kept', revision: 'rev1' },
    });
    expect(stepDraftFrom(step('s2')).photo).toEqual({ kind: 'none' });
  });

  describe('reproches', () => {
    it('exige un titre, espaces seuls compris', () => {
      expect(stepIssueOf(EMPTY_DELIVERY_STEP_DRAFT)).toBe('title-required');
      expect(stepIssueOf({ ...EMPTY_DELIVERY_STEP_DRAFT, title: '   ' })).toBe('title-required');
    });

    it('mesure le titre après trim, comme le contrat', () => {
      const exact = 'a'.repeat(DELIVERY_STEP_TITLE_MAX);
      expect(stepIssueOf({ ...EMPTY_DELIVERY_STEP_DRAFT, title: ` ${exact} ` })).toBe('');
      expect(stepIssueOf({ ...EMPTY_DELIVERY_STEP_DRAFT, title: `${exact}a` })).toBe(
        'title-too-long',
      );
    });

    it('borne le texte', () => {
      const draft = { ...EMPTY_DELIVERY_STEP_DRAFT, title: 'Portail' };
      expect(stepIssueOf({ ...draft, body: 'a'.repeat(DELIVERY_STEP_BODY_MAX) })).toBe('');
      expect(stepIssueOf({ ...draft, body: 'a'.repeat(DELIVERY_STEP_BODY_MAX + 1) })).toBe(
        'body-too-long',
      );
    });
  });

  it('envoie des champs nettoyés', () => {
    expect(toStepFields({ title: ' Portail ', body: ' Code \n', photo: { kind: 'none' } })).toEqual(
      {
        title: 'Portail',
        body: 'Code',
      },
    );
  });

  it('une étape ajoutée part avec sa nouvelle photo, ou sans', () => {
    expect(
      newStepPhotoOf({ ...EMPTY_DELIVERY_STEP_DRAFT, photo: { kind: 'picked', photo: PHOTO } }),
    ).toBe(PHOTO);
    expect(newStepPhotoOf(EMPTY_DELIVERY_STEP_DRAFT)).toBeNull();
  });

  describe('ce qu’on fait de la photo d’une étape refaite', () => {
    const initial = stepDraftFrom(PORTAIL);

    /** La confusion à éviter : corriger le titre ne doit pas effacer la photo. */
    it('n’y touche pas quand seul le titre change', () => {
      expect(photoChangeOf({ ...initial, title: 'Grand portail' }, initial)).toEqual({
        kind: 'keep',
      });
    });

    it('la remplace par une nouvelle', () => {
      expect(
        photoChangeOf({ ...initial, photo: { kind: 'picked', photo: PHOTO } }, initial),
      ).toEqual({
        kind: 'replace',
        photo: PHOTO,
      });
    });

    it('la retire quand on l’a retirée', () => {
      expect(photoChangeOf({ ...initial, photo: { kind: 'none' } }, initial)).toEqual({
        kind: 'remove',
      });
    });

    it('ne demande pas de retirer une photo qui n’existait pas', () => {
      const bare = stepDraftFrom(step('s2'));
      expect(photoChangeOf(bare, bare)).toEqual({ kind: 'keep' });
    });
  });

  describe('modifié ?', () => {
    const initial = stepDraftFrom(PORTAIL);

    it('non à l’ouverture, ni pour des espaces ajoutés', () => {
      expect(isStepDraftChanged(initial, initial)).toBe(false);
      expect(isStepDraftChanged({ ...initial, title: 'Portail  ' }, initial)).toBe(false);
    });

    it('oui dès qu’un texte ou la photo change', () => {
      expect(isStepDraftChanged({ ...initial, body: 'Code 9999' }, initial)).toBe(true);
      expect(isStepDraftChanged({ ...initial, photo: { kind: 'none' } }, initial)).toBe(true);
      expect(
        isStepDraftChanged({ ...initial, photo: { kind: 'picked', photo: PHOTO } }, initial),
      ).toBe(true);
    });
  });
});

describe('déplacer une étape', () => {
  const steps = [step('a'), step('b'), step('c')];

  it('échange avec la voisine, et rend TOUS les identifiants', () => {
    expect(movedStepIds(steps, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(movedStepIds(steps, 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('refuse de sortir des bornes', () => {
    expect(movedStepIds(steps, 'a', -1)).toBeNull();
    expect(movedStepIds(steps, 'c', 1)).toBeNull();
  });

  it('refuse une étape inconnue', () => {
    expect(movedStepIds(steps, 'z', 1)).toBeNull();
  });
});

it(`on ajoute jusqu’à ${DELIVERY_PROCEDURE_MAX_STEPS} étapes, pas une de plus`, () => {
  expect(canAddStep(DELIVERY_PROCEDURE_MAX_STEPS - 1)).toBe(true);
  expect(canAddStep(DELIVERY_PROCEDURE_MAX_STEPS)).toBe(false);
});
