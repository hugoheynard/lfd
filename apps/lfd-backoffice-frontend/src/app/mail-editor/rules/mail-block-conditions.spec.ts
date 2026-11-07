import type { MailEditorResources } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { absenceLabel, conditionsByBlock } from './mail-block-conditions';

const RESOURCES: MailEditorResources = {
  values: [],
  links: [],
  dataBlocks: [
    { block: 'summary', label: 'Récapitulatif', description: 'les lignes' },
    {
      block: 'itinerary',
      label: 'Itinéraire',
      description: 'le point de retrait',
      condition: 'Seulement pour un retrait ; absent pour une livraison.',
    },
    { block: 'image', label: 'QR', description: 'le code', condition: '' },
  ],
};

describe('conditions d’affichage des blocs de données', () => {
  it('ne retient que les blocs qui portent une condition', () => {
    const conditions = conditionsByBlock(RESOURCES);
    expect([...conditions.keys()]).toEqual(['itinerary']);
    expect(conditions.get('itinerary')).toContain('Seulement pour un retrait');
  });

  it('dit l’absence d’après la situation rendue', () => {
    expect(absenceLabel('delivery')).toBe('Absent pour une livraison');
    expect(absenceLabel('pickup')).toBe('Absent pour un retrait');
  });
});
