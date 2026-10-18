import { TestBed } from '@angular/core/testing';
import type { StaffSuggestionPreviewPayload, StaffSuggestionPreviewView } from '@lfd/contracts';
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
};

const SHOWN = staffSuggestion({ id: '01JSHOWN', phrase: null });
const ENDED = staffSuggestion({ id: '01JENDED', endsOn: '2026-10-18' });

class FakeApi {
  readonly asked: StaffSuggestionPreviewPayload[] = [];
  preview(payload: StaffSuggestionPreviewPayload): Promise<StaffSuggestionPreviewView> {
    this.asked.push(payload);
    return Promise.resolve({
      day: payload.day ?? '',
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
          },
          reason: { source: 'staff', ruleId: '01jshown', phrase: null },
        },
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
});
