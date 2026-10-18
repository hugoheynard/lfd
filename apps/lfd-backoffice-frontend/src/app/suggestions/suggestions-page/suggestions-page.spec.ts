import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  StaffPermission,
  StaffSuggestionCountersView,
  StaffSuggestionRuleView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { staffSuggestion } from '../staff-suggestion.testing';
import { StaffSuggestionsService } from '../staff-suggestions.service';
import { SuggestionsPage } from './suggestions-page';

const CHOICES = {
  articles: [
    { sku: 'VIE-001', name: 'Croissant', familyId: 'fam-vien' },
    { sku: 'PAI-001', name: 'Baguette', familyId: 'fam-pains' },
  ],
  families: [{ id: 'fam-vien', name: 'Viennoiseries' }],
};

class FakeApi {
  rules: readonly StaffSuggestionRuleView[] = [];
  rows: readonly StaffSuggestionCountersView[] = [];
  failList = false;
  failCounters = false;
  readonly toggled: { readonly id: string; readonly active: boolean }[] = [];

  list(): Promise<readonly StaffSuggestionRuleView[]> {
    return this.failList ? Promise.reject(new Error('réseau')) : Promise.resolve(this.rules);
  }
  choices() {
    return Promise.resolve(CHOICES);
  }
  counters(): Promise<readonly StaffSuggestionCountersView[]> {
    return this.failCounters ? Promise.reject(new Error('réseau')) : Promise.resolve(this.rows);
  }
  order() {
    return Promise.resolve({ order: 'recent' as const, updatedAt: null });
  }
  setActive(id: string, active: boolean) {
    this.toggled.push({ id, active });
    return Promise.resolve({ id });
  }
}

async function render(
  api: FakeApi,
  granted: readonly StaffPermission[] = ['lfc_suggestions:read'],
) {
  TestBed.configureTestingModule({
    imports: [SuggestionsPage],
    providers: [
      { provide: StaffSuggestionsService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          permissions: signal(granted),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SuggestionsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SuggestionsPage', () => {
  it('une panne se dit en alerte, avec Réessayer', async () => {
    const api = new FakeApi();
    api.failList = true;
    const root = await render(api);
    expect(root.textContent).toContain('Impossible de charger les suggestions');
  });

  it('dit chaque règle nommée, ses chiffres, et qu’ils sont à zéro faute d’affichage', async () => {
    const api = new FakeApi();
    api.rules = [
      staffSuggestion(),
      staffSuggestion({ id: 'OLD', archivedAt: '2026-10-01T08:00:00.000Z', phrase: null }),
    ];
    api.rows = [{ ruleId: '01JRULE', shown: 0, clicked: 0, added: 0 }];
    const root = await render(api);

    const cards = root.querySelectorAll('fold-card');
    expect(root.textContent).toContain('Article au panier : Croissant → Baguette');
    expect(root.textContent).toContain('Notre conseil');
    expect(root.textContent).toContain('Archivées');
    expect(root.textContent).toContain('Affichée');
    expect(root.textContent).toContain('les chiffres restent à zéro');
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it('une panne des chiffres laisse la liste et le dit', async () => {
    const api = new FakeApi();
    api.rules = [staffSuggestion()];
    api.failCounters = true;
    const root = await render(api);
    expect(root.textContent).toContain('Avec un croissant, la baguette');
    expect(root.textContent).toContain('les chiffres n’ont pas pu être lus');
  });

  it('sans lfc_suggestions:write, aucun geste', async () => {
    const api = new FakeApi();
    api.rules = [staffSuggestion()];
    const root = await render(api);
    expect(root.textContent).not.toContain('Nouvelle suggestion');
    expect(root.textContent).not.toContain('Couper');
  });

  it('avec l’écriture, coupe une règle active', async () => {
    const api = new FakeApi();
    api.rules = [staffSuggestion()];
    const root = await render(api, ['lfc_suggestions:read', 'lfc_suggestions:write']);
    const cut = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Couper'),
    );
    cut?.click();
    await Promise.resolve();
    expect(api.toggled).toEqual([{ id: '01JRULE', active: false }]);
  });
});
