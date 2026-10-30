import type { PromotionAudienceTargetView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  boxStateOf,
  minimalAudiences,
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
