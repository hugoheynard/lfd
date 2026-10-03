import type { DeliveryLoadingPlanStepView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  alreadyLoadedNotice,
  loadedBinNotice,
  planBinOf,
  refusalNotice,
} from './delivery-loading-notice';

const ORDER: readonly DeliveryLoadingPlanStepView[] = [
  {
    step: 1,
    stopPosition: 5,
    reference: 'CMD-5',
    customerLabel: 'Café de la Gare',
    bins: [
      {
        binId: 'b-1',
        code: 'H4N9QC',
        reference: 'CMD-5',
        binTypeName: 'Bac M',
        half: null,
        sharedWithReference: null,
        isotherm: false,
        stackIndex: 1,
      },
    ],
  },
];

describe('l’avis après un scan', () => {
  const entry = planBinOf({ order: ORDER }, { code: 'H4N9QC' });

  it('retrouve le bac du plan par code ou par identifiant', () => {
    expect(entry).toMatchObject({ key: 'b-1:whole', stopPosition: 5 });
    expect(planBinOf({ order: ORDER }, { binId: 'b-1' })?.key).toBe('b-1:whole');
    expect(planBinOf({ order: ORDER }, { code: 'ZZZ999' })).toBeNull();
  });

  it('dit le suivant pour un scan dans l’ordre, et l’aide de rangée pour un autre', () => {
    if (entry === null) {
      throw new Error('fixture');
    }
    expect(loadedBinNotice(entry, null, null)).toEqual({
      variant: 'success',
      title: 'H4N9QC chargé · arrêt 5',
      text: 'Tout est chargé.',
      showRow: null,
    });
    const elsewhere = {
      text: 'Le bac H4N9QC va rangée 2, pile 1 — pas dans cette rangée.',
      location: { row: 2, stackIndex: 1, code: 'H4N9QC' },
    };
    expect(loadedBinNotice(entry, elsewhere, entry)).toMatchObject({
      variant: 'info',
      text: elsewhere.text,
      showRow: 2,
    });
  });

  it('un déjà chargé avertit, un refus garde la phrase du serveur', () => {
    expect(alreadyLoadedNotice('H4N9QC')).toMatchObject({
      variant: 'warning',
      title: 'H4N9QC est déjà chargé',
    });
    expect(refusalNotice('Ce bac part dans le Master.')).toEqual({
      variant: 'alert',
      title: 'Refusé',
      text: 'Ce bac part dans le Master.',
      showRow: null,
    });
  });
});
