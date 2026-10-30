import type { PromotionAudienceTargetView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  boxStateOf,
  minimalAudiences,
  namedCompanyOf,
  toggledAudiences,
  touchesBranch,
  withCompany,
  type AudienceLeaf,
} from './audience-selection';

const t = (kind: PromotionAudienceTargetView['kind'], companyId: string | null = null) => ({
  kind,
  companyId,
});
const leaves = (...list: AudienceLeaf[]) => new Set(list);

describe('minimalAudiences', () => {
  it('tous les enfants d’un parent ⇒ le parent', () => {
    expect(minimalAudiences(leaves('individuals_guest', 'individuals_registered'))).toEqual([
      t('individuals'),
    ]);
  });

  it('les quatre feuilles ⇒ tout le monde, exclusif : aucune société gardée', () => {
    expect(
      minimalAudiences(
        leaves('individuals_guest', 'individuals_registered', 'pros_active', 'pros_pending'),
        [t('company', 'co_1')],
      ),
    ).toEqual([t('everyone')]);
  });

  it('garde les feuilles d’une branche incomplète, puis la société', () => {
    expect(
      minimalAudiences(leaves('individuals_registered', 'pros_active', 'pros_pending'), [
        t('company', 'co_1'),
      ]),
    ).toEqual([t('individuals_registered'), t('pros'), t('company', 'co_1')]);
  });
});

describe('les cases en étages', () => {
  it('un parent coché coche et grise ses enfants', () => {
    const value = [t('pros')];
    expect(boxStateOf('pros', value)).toEqual({
      checked: true,
      indeterminate: false,
      disabled: false,
    });
    expect(boxStateOf('pros_active', value)).toEqual({
      checked: true,
      indeterminate: false,
      disabled: true,
    });
  });

  it('certains enfants cochés ⇒ parent indéterminé', () => {
    expect(boxStateOf('individuals', [t('individuals_registered')]).indeterminate).toBe(true);
    expect(boxStateOf('everyone', [t('individuals_registered')]).indeterminate).toBe(true);
  });

  it('« Tout le monde » coché grise tout le reste', () => {
    expect(boxStateOf('individuals', [t('everyone')]).disabled).toBe(true);
    expect(boxStateOf('pros_pending', [t('everyone')]).disabled).toBe(true);
  });

  it('cocher le second enfant coche le parent', () => {
    expect(toggledAudiences([t('pros_active')], 'pros_pending', true)).toEqual([t('pros')]);
  });

  it('décocher une feuille d’une branche pleine laisse l’autre', () => {
    expect(toggledAudiences([t('individuals')], 'individuals_guest', false)).toEqual([
      t('individuals_registered'),
    ]);
  });

  it('une société se pose, avec ou sans ses sites, et se retire', () => {
    const named = withCompany([t('pros_active')], { companyId: 'co_1', withSites: true });
    expect(named).toEqual([t('pros_active'), t('company_and_sites', 'co_1')]);
    expect(touchesBranch(withCompany([], { companyId: 'co_1', withSites: false }), 'pros')).toBe(
      true,
    );
    expect(withCompany(named, null)).toEqual([t('pros_active')]);
  });
});

describe('les bords de l’arbre des publics', () => {
  it('un public vide ne coche rien, ne grise rien, ne marque aucun parent partiel', () => {
    for (const box of ['everyone', 'individuals', 'pros', 'pros_active'] as const) {
      expect(boxStateOf(box, [])).toEqual({
        checked: false,
        indeterminate: false,
        disabled: false,
      });
    }
  });

  it('une reprise « tous sauf les pros actifs » se lit en trois feuilles', () => {
    const value = [t('everyone_but_active_pros')];
    expect(boxStateOf('individuals', value).checked).toBe(true);
    expect(boxStateOf('pros', value)).toMatchObject({ checked: false, indeterminate: true });
    expect(boxStateOf('pros_active', value).checked).toBe(false);
    expect(boxStateOf('pros_pending', value).checked).toBe(true);
    expect(boxStateOf('everyone', value)).toMatchObject({ checked: false, indeterminate: true });
  });

  it('cocher « Tout le monde » est exclusif : la société nommée s’en va', () => {
    expect(toggledAudiences([t('pros_active'), t('company', 'co_1')], 'everyone', true)).toEqual([
      t('everyone'),
    ]);
  });

  it('décocher « Tout le monde » vide le public (le brouillon le refusera)', () => {
    expect(toggledAudiences([t('everyone')], 'everyone', false)).toEqual([]);
  });

  it('décocher une feuille sous « Tout le monde » laisse les trois autres, regroupées', () => {
    expect(toggledAudiences([t('everyone')], 'pros_active', false)).toEqual([
      t('individuals'),
      t('pros_pending'),
    ]);
  });

  it('décocher une branche sous « Tout le monde » laisse l’autre branche', () => {
    expect(toggledAudiences([t('everyone')], 'pros', false)).toEqual([t('individuals')]);
  });

  it('décocher la dernière feuille vide le public', () => {
    expect(toggledAudiences([t('pros_pending')], 'pros_pending', false)).toEqual([]);
  });

  it('cocher ou décocher des feuilles garde la société nommée', () => {
    const company = t('company_and_sites', 'co_1');
    expect(toggledAudiences([company], 'individuals_guest', true)).toEqual([
      t('individuals_guest'),
      company,
    ]);
    expect(toggledAudiences([t('pros'), company], 'pros', false)).toEqual([company]);
  });

  it('cocher deux fois la même case ne change rien, et l’ordre des clics non plus', () => {
    const once = toggledAudiences([], 'pros_pending', true);
    expect(toggledAudiences(once, 'pros_pending', true)).toEqual(once);
    const ab = toggledAudiences(
      toggledAudiences([], 'pros_pending', true),
      'individuals_guest',
      true,
    );
    const ba = toggledAudiences(
      toggledAudiences([], 'individuals_guest', true),
      'pros_pending',
      true,
    );
    expect(ab).toEqual(ba);
  });

  it('une société seule ne coche aucune case de clientèle, mais ouvre la branche Pros', () => {
    const value = [t('company', 'co_1')];
    expect(boxStateOf('pros', value)).toEqual({
      checked: false,
      indeterminate: false,
      disabled: false,
    });
    expect(touchesBranch(value, 'pros')).toBe(true);
    expect(touchesBranch(value, 'individuals')).toBe(false);
  });

  it('minimalAudiences ne laisse passer que des sociétés dans sa liste de sociétés', () => {
    expect(minimalAudiences(leaves('pros_active'), [t('pros'), t('company', 'co_1')])).toEqual([
      t('pros_active'),
      t('company', 'co_1'),
    ]);
  });

  it('nommer une société sous « Tout le monde » ne la garde pas ; une seule société à la fois', () => {
    expect(withCompany([t('everyone')], { companyId: 'co_1', withSites: false })).toEqual([
      t('everyone'),
    ]);
    const first = withCompany([t('pros')], { companyId: 'co_1', withSites: false });
    expect(withCompany(first, { companyId: 'co_2', withSites: true })).toEqual([
      t('pros'),
      t('company_and_sites', 'co_2'),
    ]);
    expect(namedCompanyOf(first)).toEqual(t('company', 'co_1'));
    expect(namedCompanyOf([t('pros')])).toBeNull();
  });
});
