import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  StaffSuggestionChoicesView,
  StaffSuggestionCountersView,
  StaffSuggestionRuleView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { parisToday } from '../../shared/paris-today';
import { StaffSuggestionsService } from '../staff-suggestions.service';
import { SuggestionOrderCard } from '../suggestion-order-card/suggestion-order-card';
import { SuggestionPanel, type SuggestionPanelData } from '../suggestion-panel/suggestion-panel';
import { countersWindow, refusalOf, splitArchived } from '../suggestion-format';
import { ruleSummary, STATE_BADGES, stateOf } from '../suggestion-summary';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Gestion Boutique › Suggestions** — les règles que le staff décide
 * (`documentation/recommandation-produit/plan-suggestions-du-staff.md`, RS1
 * et RS3) : ce qui les déclenche, ce qu'elles montrent, où, à qui, quand, et
 * leurs chiffres.
 *
 * Les chiffres (affichée, cliquée, ajoutée) sont lus dans les compteurs
 * anonymes ; tant que la boutique n'affiche pas ces suggestions (RS2), ils
 * sont à zéro, et l'écran le dit au lieu d'inventer une tendance. Une panne
 * des chiffres ou du catalogue n'efface pas la liste : elle se dit à côté.
 *
 * Écrire (créer, modifier, couper, archiver, régler l'ordre) demande
 * `lfc_suggestions:write`.
 */
@Component({
  selector: 'app-suggestions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    NgTemplateOutlet,
    SuggestionOrderCard,
  ],
  templateUrl: './suggestions-page.html',
  styleUrl: './suggestions-page.scss',
})
export class SuggestionsPage {
  private readonly api = inject(StaffSuggestionsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('loading');
  private readonly rules = signal<readonly StaffSuggestionRuleView[]>([]);
  private readonly choices = signal<StaffSuggestionChoicesView | null>(null);
  private readonly counters = signal<ReadonlyMap<string, StaffSuggestionCountersView> | null>(null);
  protected readonly partialFailure = signal<string | null>(null);
  protected readonly actionFailure = signal<string | null>(null);
  protected readonly pending = signal<string | null>(null);

  private readonly split = computed(() => splitArchived(this.rules()));
  protected readonly live = computed(() => this.split().live);
  protected readonly archived = computed(() => this.split().archived);
  protected readonly canWrite = computed(() => this.permissions.can('lfc_suggestions:write'));
  /** Aucune règle n'a encore été montrée : la boutique ne les affiche pas encore (RS2). */
  protected readonly nothingCounted = computed(() => {
    const counted = this.counters();
    return counted !== null && [...counted.values()].every((row) => row.shown === 0);
  });

  protected readonly phrase = (rule: StaffSuggestionRuleView): string =>
    rule.phrase === null ? '« Notre conseil »' : `« ${rule.phrase.fr} »`;
  /** La règle en une phrase — la même que l'aperçu du panneau. */
  protected readonly summary = (rule: StaffSuggestionRuleView): string =>
    ruleSummary(rule, this.choices());
  protected readonly badgeOf = (rule: StaffSuggestionRuleView) =>
    STATE_BADGES[stateOf(rule, parisToday())];
  protected readonly countsOf = (
    rule: StaffSuggestionRuleView,
  ): StaffSuggestionCountersView | null => this.counters()?.get(rule.id) ?? null;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.rules.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
      return;
    }
    await this.loadAround();
  }

  /** Le catalogue (pour nommer) et les chiffres : leur panne laisse la liste à l'écran. */
  private async loadAround(): Promise<void> {
    const problems: string[] = [];
    try {
      this.choices.set(await this.api.choices());
    } catch {
      problems.push('le catalogue n’a pas pu être lu : les articles se disent par leur référence');
    }
    const window = countersWindow(this.rules(), parisToday());
    try {
      const rows = window === null ? [] : await this.api.counters(window.from, window.to);
      this.counters.set(new Map(rows.map((row) => [row.ruleId, row])));
    } catch {
      this.counters.set(null);
      problems.push('les chiffres n’ont pas pu être lus');
    }
    this.partialFailure.set(
      problems.length === 0 ? null : `Affichage partiel : ${problems.join(' ; ')}.`,
    );
  }

  protected async edit(rule: StaffSuggestionRuleView | null): Promise<void> {
    const choices = this.choices();
    if (choices === null) {
      this.actionFailure.set(
        'Le catalogue n’a pas pu être lu : rechargez la page avant de composer une suggestion.',
      );
      return;
    }
    const saved = await this.panels.open<SuggestionPanelData, string>(SuggestionPanel, {
      data: { rule, choices },
    }).closed;
    if (saved !== undefined) {
      await this.reload();
    }
  }

  protected toggle(rule: StaffSuggestionRuleView): Promise<void> {
    return this.act(rule, () => this.api.setActive(rule.id, !rule.active));
  }

  protected archive(rule: StaffSuggestionRuleView): Promise<void> {
    return this.act(rule, () => this.api.archive(rule.id));
  }

  private async act(rule: StaffSuggestionRuleView, gesture: () => Promise<unknown>): Promise<void> {
    this.pending.set(rule.id);
    this.actionFailure.set(null);
    try {
      await gesture();
      await this.reload();
    } catch (error) {
      this.actionFailure.set(refusalOf(error, 'Le geste n’a pas pu être enregistré.'));
    } finally {
      this.pending.set(null);
    }
  }

  /** Après un geste : la liste et ses chiffres, sans repasser par « chargement ». */
  private async reload(): Promise<void> {
    this.rules.set(await this.api.list());
    await this.loadAround();
  }
}
