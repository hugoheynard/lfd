import { TestBed } from '@angular/core/testing';
import { addDays, type StaffSuggestionRulePayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { parisToday } from '../../shared/paris-today';
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
  order() {
    return Promise.resolve({ order: 'recent' as const, updatedAt: null });
  }
  readonly created: StaffSuggestionRulePayload[] = [];
  create(payload: StaffSuggestionRulePayload) {
    this.created.push(payload);
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

  it('l’aperçu recompose la règle en une phrase, et suit le brouillon', async () => {
    const { root, fixture } = await render(new FakeApi(), {
      rule: staffSuggestion({ audience: 'public', startsOn: '2026-10-20', endsOn: '2026-10-31' }),
      choices: CHOICES,
    });
    expect(root.textContent).toContain(
      'Quand Croissant est dans le panier, proposer Baguette au panier, aux particuliers, du 20 au 31 octobre.',
    );
    fixture.componentRef.setInput('data', {
      rule: staffSuggestion({ trigger: { kind: 'category_in_cart', ref: 'fam-vien' } }),
      choices: CHOICES,
    });
    fixture.detectChanges();
    expect(root.textContent).toContain(
      'Quand un article de la famille Viennoiseries est dans le panier, proposer Baguette',
    );
  });

  it('pose une question par groupe, et dit le réglage d’ordre sous la priorité', async () => {
    const { root, fixture } = await render(new FakeApi(), { rule: null, choices: CHOICES });
    await fixture.whenStable();
    fixture.detectChanges();
    const legends = [...root.querySelectorAll('fold-fieldset')].map((one) =>
      one.getAttribute('legend'),
    );
    expect(legends).toEqual([
      'Quand la proposer ?',
      'Que proposer ?',
      'Où l’afficher ?',
      'Pour qui ?',
      'Pendant quelle période ?',
      'Comment la présenter ?',
      'Priorité',
    ]);
    expect(
      [...root.querySelectorAll('fold-fieldset')].every(
        (one) => one.getAttribute('appearance') === 'border',
      ),
    ).toBe(true);
    expect(root.textContent).toContain('Il est aujourd’hui sur « La plus récente »');
  });

  describe('dupliquer (RS9)', () => {
    it('part d’une copie, et enregistre une NOUVELLE règle sans toucher l’originale', async () => {
      const today = parisToday();
      const api = new FakeApi();
      const original = staffSuggestion({
        startsOn: addDays(today, -30),
        endsOn: addDays(today, -23),
        priority: 7,
        audience: 'pro',
      });
      const { root, ref, fixture } = await render(api, {
        rule: original,
        choices: CHOICES,
        copy: true,
      });
      expect(root.textContent).toContain('Dupliquer la suggestion');
      expect(root.textContent).toContain('l’originale ne change pas');

      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();

      expect(api.revised).toEqual([]);
      expect(api.created).toHaveLength(1);
      expect(api.created[0]).toMatchObject({
        trigger: { kind: 'product_in_cart', ref: 'VIE-001' },
        suggestedSkus: ['PAI-001'],
        audience: 'pro',
        priority: 7,
        phrase: { fr: 'Avec un croissant, la baguette' },
        // Finie : la durée est gardée, la période recommence aujourd'hui.
        startsOn: today,
        endsOn: addDays(today, 7),
      });
      expect(ref.closedWith).toBe('NEW');
      expect(original.startsOn).toBe(addDays(today, -30));
    });

    it('une règle à venir garde ses jours dans la copie', async () => {
      const today = parisToday();
      const api = new FakeApi();
      const { root, fixture } = await render(api, {
        rule: staffSuggestion({ startsOn: addDays(today, 10), endsOn: addDays(today, 12) }),
        choices: CHOICES,
        copy: true,
      });
      button(root, 'Enregistrer')?.click();
      await fixture.whenStable();
      expect(api.created[0]).toMatchObject({
        startsOn: addDays(today, 10),
        endsOn: addDays(today, 12),
      });
    });
  });
});
