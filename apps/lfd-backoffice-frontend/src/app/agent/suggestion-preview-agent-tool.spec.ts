import type { CartSuggestionView, ShopItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { previewText } from './suggestion-preview-agent-tool';

function item(sku: string, name: string): ShopItemView {
  return {
    sku,
    name,
    note: null,
    image: null,
    thumbnail: null,
    unitPriceMillicents: 100_000,
    unitPriceTtcCents: 106,
    vatRatePercent: 5.5,
    shelfId: 'fam-pains',
    isFeatured: false,
    audience: 'both',
  };
}

const STAFF: CartSuggestionView = {
  sku: 'PAI-001',
  item: item('PAI-001', 'Baguette'),
  reason: { source: 'staff', ruleId: '01jshown', phrase: null },
};

const COMPUTED: CartSuggestionView = {
  sku: 'VIE-002',
  item: item('VIE-002', 'Pain au chocolat'),
  reason: { source: 'data', kind: 'bought_with', withSku: 'VIE-001', withName: 'Croissant' },
};

const CTX = { choices: null, rules: new Map(), order: null };
const ARGS = { placement: 'cart', audience: 'public' } as const;

describe('previewText — le calculé (R2)', () => {
  it('dit la carte du staff, puis la suggestion calculée et sa raison', () => {
    const text = previewText(
      { day: '2026-10-20', time: '09:00', shown: [STAFF, COMPUTED], rules: [] },
      ARGS,
      CTX,
    );

    expect(text).toContain('le client verrait « Notre conseil » : Baguette [PAI-001]');
    expect(text).not.toContain('; Pain au chocolat');
    expect(text).toContain(
      'Puis, calculée : « Souvent pris avec Croissant » : Pain au chocolat [VIE-002]',
    );
  });

  it('sans règle du staff, la carte décidée est absente et la calculée paraît seule', () => {
    const text = previewText(
      { day: '2026-10-20', time: '09:00', shown: [COMPUTED], rules: [] },
      ARGS,
      CTX,
    );

    expect(text).toContain('le client ne verrait aucune suggestion décidée');
    expect(text).toContain('« Souvent pris avec Croissant »');
  });
});
