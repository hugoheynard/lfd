import { TestBed } from '@angular/core/testing';
import type { PromotionView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { promotionView } from '../../../targeted-promotions/promotion.testing';
import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import { NO_PROMOTION_POLICY, type PromotionPolicyForm } from '../promotion-policy';
import { PromotionPolicyPicker } from './promotion-policy-picker';

const RENTREE = promotionView({ id: 'p_rentree', internalName: 'Rentrée', summary: '−10 %' });
const ETE = promotionView({
  id: 'p_ete',
  internalName: 'Été',
  summary: '−5 %',
  archived: { at: '2026-09-01T00:00:00.000Z', by: 'staff_1', reason: 'Fin' },
});

async function mount(
  policy: PromotionPolicyForm = NO_PROMOTION_POLICY,
  list: () => Promise<{ promotions: readonly PromotionView[] }> = async () => ({
    promotions: [RENTREE, ETE],
  }),
) {
  TestBed.configureTestingModule({
    providers: [{ provide: PromotionsService, useValue: { list } }],
  });
  const fixture = TestBed.createComponent(PromotionPolicyPicker);
  fixture.componentRef.setInput('policy', policy);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

const choice = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('fold-view-toggle button')].find((entry) =>
    entry.textContent?.includes(label),
  );

describe('<app-promotion-policy-picker>', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('offre trois positions, « Aucune promotion » par défaut, avec son aide', async () => {
    const { host } = await mount();
    expect(choice(host, 'Aucune promotion')?.getAttribute('aria-checked')).toBe('true');
    expect(choice(host, 'Toutes les promotions')).toBeDefined();
    expect(choice(host, 'Au choix')).toBeDefined();
    expect(host.querySelector('[data-policy-hint]')?.textContent).toContain(
      'Ce client paie son prix négocié, sans aucune promotion en plus — ni au catalogue, ni au panier — sur les quantités où le tarif négocié s’applique.',
    );
    expect(host.querySelector('[data-policy-promotions]')).toBeNull();
  });

  it('« Au choix » ouvre la sélection ; la liste survit à un aller-retour', async () => {
    const { fixture, host } = await mount({ mode: 'all', promotionIds: [] });
    choice(host, 'Au choix')?.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-policy-promotions]')).not.toBeNull();

    fixture.componentInstance['setIds'](['p_rentree']);
    choice(host, 'Toutes les promotions')?.click();
    choice(host, 'Au choix')?.click();
    expect(fixture.componentInstance.policy()).toEqual({
      mode: 'selected',
      promotionIds: ['p_rentree'],
    });
  });

  it('ne propose pas une archivée, sauf déjà choisie — dite « archivée »', async () => {
    const fresh = await mount({ mode: 'selected', promotionIds: [] });
    expect(fresh.fixture.componentInstance['choices']().map((c) => c.value)).toEqual(['p_rentree']);
    TestBed.resetTestingModule();

    const kept = await mount({ mode: 'selected', promotionIds: ['p_ete'] });
    expect(kept.fixture.componentInstance['choices']().map((c) => c.label)).toContain(
      'Été (archivée) — −5 %',
    );
  });

  it('une panne de lecture se dit à la place de la sélection', async () => {
    const { host } = await mount({ mode: 'selected', promotionIds: [] }, async () => {
      throw new Error('panne');
    });
    expect(host.querySelector('[data-policy-error]')).not.toBeNull();
    expect(host.querySelector('[data-policy-promotions]')).toBeNull();
  });
});
