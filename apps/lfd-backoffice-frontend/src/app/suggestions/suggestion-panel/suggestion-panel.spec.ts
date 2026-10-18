import { TestBed } from '@angular/core/testing';
import type { StaffSuggestionRulePayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../staff-suggestion.testing';
import { StaffSuggestionsService } from '../staff-suggestions.service';
import { SuggestionPanel, type SuggestionPanelData } from './suggestion-panel';

const CHOICES = {
  articles: [
    { sku: 'VIE-001', name: 'Croissant', familyId: 'fam-vien' },
    { sku: 'PAI-001', name: 'Baguette', familyId: 'fam-pains' },
  ],
  families: [{ id: 'fam-vien', name: 'Viennoiseries' }],
};

class FakeApi {
  readonly revised: { readonly id: string; readonly payload: StaffSuggestionRulePayload }[] = [];
  refuse: string | null = null;

  revise(id: string, payload: StaffSuggestionRulePayload) {
    if (this.refuse !== null) {
      return Promise.reject(new Error(this.refuse));
    }
    this.revised.push({ id, payload });
    return Promise.resolve({ id });
  }
  create() {
    return Promise.resolve({ id: 'NEW' });
  }
}

class FakeRef {
  closedWith: string | undefined | null = null;
  close(value?: string): void {
    this.closedWith = value;
  }
}

async function render(api: FakeApi, data: SuggestionPanelData) {
  const ref = new FakeRef();
  TestBed.configureTestingModule({
    imports: [SuggestionPanel],
    providers: [
      { provide: StaffSuggestionsService, useValue: api },
      { provide: FoldPanelRef, useValue: ref },
    ],
  });
  const fixture = TestBed.createComponent(SuggestionPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  return { root: fixture.nativeElement as HTMLElement, ref, fixture };
}

function button(root: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((one) => one.textContent?.trim() === label);
}

describe('SuggestionPanel', () => {
  it('une règle neuve dit ce qui manque, et le bouton reste fermé', async () => {
    const { root } = await render(new FakeApi(), { rule: null, choices: CHOICES });
    expect(root.textContent).toContain('Nouvelle suggestion');
    expect(root.textContent).toContain('Choisissez au moins un article à montrer.');
    expect(button(root, 'Enregistrer')?.disabled).toBe(true);
  });

  it('réécrit une règle existante, nommée par le catalogue, et ferme sur son id', async () => {
    const api = new FakeApi();
    const { root, ref, fixture } = await render(api, { rule: staffSuggestion(), choices: CHOICES });
    expect(root.textContent).toContain('Modifier la suggestion');
    expect(root.textContent).toContain('Baguette');

    button(root, 'Enregistrer')?.click();
    await fixture.whenStable();
    expect(api.revised[0]?.payload).toMatchObject({
      trigger: { kind: 'product_in_cart', ref: 'VIE-001' },
      suggestedSkus: ['PAI-001'],
    });
    expect(ref.closedWith).toBe('01JRULE');
  });

  it('un refus reste dans le panneau', async () => {
    const api = new FakeApi();
    api.refuse = 'La suggestion est archivée';
    const { root, ref, fixture } = await render(api, { rule: staffSuggestion(), choices: CHOICES });
    button(root, 'Enregistrer')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(ref.closedWith).toBeNull();
    expect(root.querySelector('fold-callout[variant="alert"]')).not.toBeNull();
  });
});
