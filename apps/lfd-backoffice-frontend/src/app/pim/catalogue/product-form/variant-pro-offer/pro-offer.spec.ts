import type { PublishedEntryView, PublishedVariantView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { proOfferCauseOf, proOfferNotesOf, settledAtCommerce, type ProOfferTab } from './pro-offer';

/** L6 de `plan-pro-voit-les-declinaisons.md` : la cause réelle, lue dans la vue du commerce. */

function variant(over: Partial<PublishedVariantView> = {}): PublishedVariantView {
  return {
    sku: 'ANC-001-2',
    name: 'Ancolie part',
    onSale: true,
    isDefault: false,
    gaps: [],
    reviewPending: { pro: false, public: false },
    pro: { state: 'en_vente', htMillicents: 1_000_000 },
    public: { state: 'en_vente', ttcCents: 450 },
    ...over,
  };
}

function entry(
  variants: readonly PublishedVariantView[],
  over: Partial<PublishedEntryView> = {},
): PublishedEntryView {
  return {
    productId: 'prd_1',
    productSku: 'ANC-001',
    name: 'Ancolie',
    categoryId: 'cat_1',
    status: 'active',
    audience: 'both',
    audienceInherited: true,
    familyAudience: 'both',
    variants: [...variants],
    receivedAt: '2026-10-29T08:00:00.000Z',
    ...over,
  };
}

describe('proOfferCauseOf', () => {
  it('ne dit rien d’une déclinaison en vente aux pros', () => {
    expect(proOfferCauseOf(entry([variant()]), 'ANC-001-2')).toBeNull();
  });

  it('dit « pas de prix pro » : incomplète pour les pros, sans manque ni prix', () => {
    const part = variant({ pro: { state: 'incomplet', htMillicents: null } });
    expect(proOfferCauseOf(entry([part]), 'ANC-001-2')).toBe('no_pro_price');
  });

  it('distingue un taux absent d’un prix absent', () => {
    const part = variant({ pro: { state: 'incomplet', htMillicents: 1_000_000 } });
    expect(proOfferCauseOf(entry([part]), 'ANC-001-2')).toBe('no_vat_rate');
  });

  it('dit « incomplète » quand la fiche déclare des manques', () => {
    const part = variant({ gaps: ['price'], pro: { state: 'incomplet', htMillicents: null } });
    expect(proOfferCauseOf(entry([part]), 'ANC-001-2')).toBe('incomplete');
  });

  it('dit « réservée aux particuliers » d’une fiche d’audience public', () => {
    const part = variant({ pro: { state: 'pas_vendu', htMillicents: null } });
    expect(proOfferCauseOf(entry([part], { audience: 'public' }), 'ANC-001-2')).toBe('public_only');
  });

  it('dit l’attente de validation pro, et le masquage', () => {
    const pending = variant({ pro: { state: 'en_attente_validation', htMillicents: 1 } });
    const hidden = variant({ pro: { state: 'masque', htMillicents: 1 } });
    expect(proOfferCauseOf(entry([pending]), 'ANC-001-2')).toBe('review_pending');
    expect(proOfferCauseOf(entry([hidden]), 'ANC-001-2')).toBe('hidden');
  });

  it('dit « fiche inactive »', () => {
    const part = variant({ pro: { state: 'inactif', htMillicents: 1 } });
    expect(proOfferCauseOf(entry([part]), 'ANC-001-2')).toBe('inactive');
  });

  it('dit « absente du commerce » sans entrée, ou sans la déclinaison', () => {
    expect(proOfferCauseOf(undefined, 'ANC-001-2')).toBe('not_received');
    expect(proOfferCauseOf(entry([]), 'ANC-001-2')).toBe('not_received');
  });

  it('renvoie au Catalogue publié seulement ce qui s’y lève', () => {
    expect(settledAtCommerce('review_pending')).toBe(true);
    expect(settledAtCommerce('hidden')).toBe(true);
    expect(settledAtCommerce('no_pro_price')).toBe(false);
  });
});

describe('proOfferNotesOf', () => {
  const TABS: readonly ProOfferTab[] = [
    { id: 'var_1', label: 'Ancolie', sku: 'ANC-001-1', isDefault: true },
    { id: 'var_2', label: 'Ancolie part', sku: 'ANC-001-2', isDefault: false },
  ];
  const view = entry([
    variant({ sku: 'ANC-001-1', isDefault: true }),
    variant({ pro: { state: 'incomplet', htMillicents: null } }),
  ]);

  it('mentionne la déclinaison montrée que le canal pro ne sert pas', () => {
    expect(proOfferNotesOf(view, TABS, true)).toEqual([
      { id: 'var_2', label: 'Ancolie part', sku: 'ANC-001-2', cause: 'no_pro_price' },
    ]);
  });

  it('se tait sur une déclinaison qui n’est pas montrée (fiche sans vignettes)', () => {
    expect(proOfferNotesOf(view, TABS, false)).toEqual([]);
  });
});
