import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  ComputedSuggestionResultRow,
  StaffPermission,
  StaffSuggestionRuleAlert,
  StaffSuggestionResultPeriod,
  StaffSuggestionResultRow,
  StaffSuggestionResultsView,
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
  sites: [],
};

class FakeApi {
  rules: readonly StaffSuggestionRuleView[] = [];
  rows: readonly StaffSuggestionResultRow[] = [];
  computed: readonly ComputedSuggestionResultRow[] = [];
  readonly periods: StaffSuggestionResultPeriod[] = [];
  failList = false;
  failCounters = false;
  alertRules: readonly StaffSuggestionRuleAlert[] = [];
  failAlerts = false;
  readonly toggled: { readonly id: string; readonly active: boolean }[] = [];

  list(): Promise<readonly StaffSuggestionRuleView[]> {
    return this.failList ? Promise.reject(new Error('réseau')) : Promise.resolve(this.rules);
  }
  choices() {
    return Promise.resolve(CHOICES);
  }
  results(days: StaffSuggestionResultPeriod): Promise<StaffSuggestionResultsView> {
    this.periods.push(days);
    return this.failCounters
      ? Promise.reject(new Error('réseau'))
      : Promise.resolve({
          days,
          from: '2026-09-19',
          to: '2026-10-18',
          rules: this.rows,
          computed: this.computed,
        });
  }
  alerts() {
    return this.failAlerts
      ? Promise.reject(new Error('réseau'))
      : Promise.resolve({ today: '2026-10-18', rules: this.alertRules });
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
  return (await renderFixture(api, granted)).nativeElement as HTMLElement;
}

async function renderFixture(
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
  return fixture;
}

const zeroRow: StaffSuggestionResultRow = {
  ruleId: '01JRULE',
  shown: 0,
  clicked: 0,
  added: 0,
  orderedEstimate: 0,
  addRateBasisPoints: null,
  revenueEstimateCents: 0,
};

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
    api.rows = [zeroRow];
    const root = await render(api);

    const cards = root.querySelectorAll('fold-card');
    expect(root.textContent).toContain(
      'Quand Croissant est dans le panier, proposer Baguette au panier, aux professionnels et aux particuliers, du 18 au 25 octobre.',
    );
    expect(root.textContent).toContain('Notre conseil');
    expect(root.textContent).toContain('Archivées');
    expect(root.textContent).toContain('Affichée');
    expect(root.textContent).toContain('les chiffres restent à zéro');
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it('dit le taux d’ajout, les commandées et le CA estimés, avec l’aide, sur 30 jours par défaut', async () => {
    const api = new FakeApi();
    api.rules = [staffSuggestion()];
    api.rows = [
      {
        ...zeroRow,
        shown: 8,
        clicked: 3,
        added: 2,
        orderedEstimate: 2,
        addRateBasisPoints: 2500,
        revenueEstimateCents: 240,
      },
    ];
    const root = await render(api);
    const text = (root.textContent ?? '').replace(/\s/gu, ' ');
    expect(api.periods).toEqual([30]);
    expect(text).toContain("Taux d'ajout");
    expect(text).toContain('25 %');
    expect(text).toContain('Commandées (estimé)');
    expect(text).toContain('2,40 €');
    expect(text).toContain('une commande ne se relie pas à un clic');
    expect(text).not.toContain('les chiffres restent à zéro');
  });

  it('dit les deux lignes « Calculé » sous les règles, et l’aide dit que le partage les inclut', async () => {
    const api = new FakeApi();
    api.rules = [staffSuggestion()];
    api.rows = [zeroRow];
    const counts = {
      shown: 0,
      clicked: 0,
      added: 0,
      orderedEstimate: 0,
      addRateBasisPoints: null,
      revenueEstimateCents: 0,
    };
    api.computed = [
      { ...counts, kind: 'bought_with', shown: 4, added: 1, orderedEstimate: 1 },
      { ...counts, kind: 'usuals' },
    ];
    const root = await render(api);
    const text = (root.textContent ?? '').replace(/\s/gu, ' ');
    const rulesAt = text.indexOf('Notre conseil');
    expect(text.indexOf('Calculé : souvent pris avec')).toBeGreaterThan(rulesAt);
    expect(text).toContain('Calculé : vos habituels');
    expect(text).toContain('règles de l’équipe comme suggestions calculées');
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

  describe('les alertes (RS10)', () => {
    const emptyAlert: StaffSuggestionRuleAlert = {
      ruleId: 'EMPTY',
      severity: 'empty',
      triggerWithdrawn: false,
      conditions: [],
      items: [{ sku: 'PAI-001', audience: 'public', reason: 'hidden_for_audience' }],
      window: { from: '2026-10-18', to: '2026-10-25', capped: false },
    };

    it('« Vide » et la raison en clair sous la phrase ; « À corriger » ne garde que les signalées', async () => {
      const api = new FakeApi();
      api.rules = [
        staffSuggestion({ id: 'EMPTY' }),
        staffSuggestion({ id: 'SANE', phrase: { fr: 'Une règle saine' } }),
      ];
      api.alertRules = [emptyAlert];
      const fixture = await renderFixture(api);
      const root = fixture.nativeElement as HTMLElement;
      const text = () => (root.textContent ?? '').replace(/\s+/gu, ' ');
      expect(text()).toContain('Vide');
      expect(text()).toContain('« Baguette » est masqué pour les particuliers.');
      expect(text()).toContain('Une règle saine');

      const toFix = [...root.querySelectorAll<HTMLElement>('[role="radio"]')].find((segment) =>
        segment.textContent?.includes('À corriger (1)'),
      );
      expect(toFix).toBeDefined();
      toFix?.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(text()).not.toContain('Une règle saine');
      expect(text()).toContain('« Baguette » est masqué pour les particuliers.');
    });

    it('une panne des alertes laisse la liste et le dit', async () => {
      const api = new FakeApi();
      api.rules = [staffSuggestion()];
      api.failAlerts = true;
      const root = await render(api);
      expect(root.textContent).toContain('Avec un croissant, la baguette');
      expect(root.textContent).toContain('les alertes n’ont pas pu être lues');
    });
  });
});
