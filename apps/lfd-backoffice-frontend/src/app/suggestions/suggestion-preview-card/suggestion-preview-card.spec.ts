import { TestBed } from '@angular/core/testing';
import type {
  CartSuggestionView,
  StaffSuggestionPreviewPayload,
  StaffSuggestionPreviewView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../staff-suggestion.testing';
import { StaffSuggestionsService } from '../staff-suggestions.service';
import { SuggestionPreviewCard } from './suggestion-preview-card';

const CHOICES = {
  articles: [
    { sku: 'VIE-001', name: 'Croissant', familyId: 'fam-vien' },
    { sku: 'PAI-001', name: 'Baguette', familyId: 'fam-pains' },
  ],
  families: [],
  sites: [],
};

const SHOWN = staffSuggestion({ id: '01JSHOWN', phrase: null });
const ENDED = staffSuggestion({ id: '01JENDED', endsOn: '2026-10-18' });

class FakeApi {
  readonly asked: StaffSuggestionPreviewPayload[] = [];
  constructor(private readonly computed: readonly CartSuggestionView[] = []) {}
  preview(payload: StaffSuggestionPreviewPayload): Promise<StaffSuggestionPreviewView> {
    this.asked.push(payload);
    return Promise.resolve({
      day: payload.day ?? '',
      time: payload.time ?? '09:00',
      shown: [
        {
          sku: 'PAI-001',
          item: {
            sku: 'PAI-001',
            name: 'Baguette',
            note: null,
            image: null,
            thumbnail: null,
            unitPriceMillicents: 100_000,
            unitPriceTtcCents: 106,
            vatRatePercent: 5.5,
            shelfId: 'fam-pains',
            isFeatured: false,
            audience: 'both',
          },
          reason: { source: 'staff', ruleId: '01jshown', phrase: null },
        },
        ...this.computed,
      ],
      rules: [
        {
          ruleId: '01JSHOWN',
          status: 'shown',
          outrankedBy: null,
          items: [{ sku: 'PAI-001', status: 'shown', outrankedBy: null }],
        },
        { ruleId: '01JENDED', status: 'ended', outrankedBy: null, items: [] },
      ],
    });
  }
  order() {
    return Promise.resolve({ order: 'recent' as const, updatedAt: null });
  }
}

describe('SuggestionPreviewCard', () => {
  it('ouverte depuis une règle : la carte du client, puis « affichée » ou la raison', async () => {
    const api = new FakeApi();
    TestBed.configureTestingModule({
      imports: [SuggestionPreviewCard],
      providers: [{ provide: StaffSuggestionsService, useValue: api }],
    });
    const fixture = TestBed.createComponent(SuggestionPreviewCard);
    fixture.componentRef.setInput('rules', [SHOWN, ENDED]);
    fixture.componentRef.setInput('choices', CHOICES);
    const root = fixture.nativeElement as HTMLElement;
    root.scrollIntoView = () => undefined;
    fixture.detectChanges();

    await fixture.componentInstance.openFor({
      placement: 'cart',
      cart: ['VIE-001'],
      viewedSku: null,
      audience: 'public',
      day: '2026-10-20',
      time: '',
      cartTotal: '',
      siteId: null,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.asked).toEqual([
      {
        placement: 'cart',
        skus: ['VIE-001'],
        audience: 'public',
        day: '2026-10-20',
        pickupAddressId: null,
      },
    ]);
    const text = (root.textContent ?? '').replace(/\s+/gu, ' ');
    expect(text).toContain('Notre conseil');
    expect(text).toContain('1,06 € TTC');
    expect(text).toContain('Affichée');
    expect(text).toContain('Finie le 18 octobre');
  });

  it('à l’accueil : la demande porte « home », la carte prend « Notre sélection »', async () => {
    const api = new FakeApi();
    TestBed.configureTestingModule({
      imports: [SuggestionPreviewCard],
      providers: [{ provide: StaffSuggestionsService, useValue: api }],
    });
    const fixture = TestBed.createComponent(SuggestionPreviewCard);
    fixture.componentRef.setInput('rules', [SHOWN, ENDED]);
    fixture.componentRef.setInput('choices', CHOICES);
    const root = fixture.nativeElement as HTMLElement;
    root.scrollIntoView = () => undefined;
    fixture.detectChanges();

    await fixture.componentInstance.openFor({
      placement: 'home',
      cart: [],
      viewedSku: null,
      audience: 'public',
      day: '2026-10-20',
      time: '',
      cartTotal: '',
      siteId: null,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.asked.map((payload) => payload.placement)).toEqual(['home']);
    expect((root.textContent ?? '').replace(/\s+/gu, ' ')).toContain('Notre sélection');
  });

  it('R2 : au panier, la suggestion calculée suit la carte du staff, avec sa raison', async () => {
    const api = new FakeApi([
      {
        sku: 'VIE-002',
        item: {
          sku: 'VIE-002',
          name: 'Pain au chocolat',
          note: null,
          image: null,
          thumbnail: null,
          unitPriceMillicents: 100_000,
          unitPriceTtcCents: 125,
          vatRatePercent: 5.5,
          shelfId: 'fam-vien',
          isFeatured: false,
          audience: 'both',
        },
        reason: { source: 'data', kind: 'bought_with', withSku: 'VIE-001', withName: 'Croissant' },
      },
    ]);
    TestBed.configureTestingModule({
      imports: [SuggestionPreviewCard],
      providers: [{ provide: StaffSuggestionsService, useValue: api }],
    });
    const fixture = TestBed.createComponent(SuggestionPreviewCard);
    fixture.componentRef.setInput('rules', [SHOWN, ENDED]);
    fixture.componentRef.setInput('choices', CHOICES);
    const root = fixture.nativeElement as HTMLElement;
    root.scrollIntoView = () => undefined;
    fixture.detectChanges();

    await fixture.componentInstance.openFor({
      placement: 'cart',
      cart: ['VIE-001'],
      viewedSku: null,
      audience: 'public',
      day: '2026-10-20',
      time: '',
      cartTotal: '',
      siteId: null,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const cards = [...root.querySelectorAll('.client-card')].map((card) =>
      (card.textContent ?? '').replace(/\s+/gu, ' '),
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContain('Notre conseil');
    expect(cards[0]).not.toContain('Pain au chocolat');
    expect(cards[1]).toContain('Souvent pris avec Croissant');
    expect(cards[1]).toContain('Pain au chocolat');
    expect(cards[1]).toContain('1,25 € TTC');
  });
});
