import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  DEFAULT_STAFF_SUGGESTION_RESULT_PERIOD,
  type ComputedSuggestionResultRow,
  type StaffSuggestionChoicesView,
  type StaffSuggestionResultPeriod,
  type StaffSuggestionResultRow,
  type StaffSuggestionRuleAlert,
  type StaffSuggestionRuleView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { parisToday } from '../../shared/paris-today';
import { StaffSuggestionsService } from '../staff-suggestions.service';
import { SuggestionComputedResults } from '../suggestion-computed-results/suggestion-computed-results';
import { SuggestionOrderCard } from '../suggestion-order-card/suggestion-order-card';
import { SuggestionPanel, type SuggestionPanelData } from '../suggestion-panel/suggestion-panel';
import { SuggestionPreviewCard } from '../suggestion-preview-card/suggestion-preview-card';
import { previewSetupOf } from '../suggestion-preview';
import { refusalOf } from '../suggestion-format';
import type { SuggestionGesture } from '../suggestion-gesture';
import { ESTIMATE_HELP, RESULT_PERIOD_OPTIONS, resultPeriodOf } from '../suggestion-results';
import { SuggestionRuleList } from '../suggestion-rule-list/suggestion-rule-list';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Gestion Boutique › Suggestions** — les règles que le staff décide
 * (`documentation/recommandation-produit/suggestions-du-staff.md`, RS1
 * et RS3) : ce qui les déclenche, ce qu'elles montrent, où, à qui, quand, et
 * leurs chiffres.
 *
 * Les chiffres (affichée, cliquée, ajoutée) sont lus dans les compteurs
 * anonymes ; tant que la boutique n'affiche pas ces suggestions (RS2), ils
 * sont à zéro, et l'écran le dit au lieu d'inventer une tendance. Commandées
 * et chiffre d'affaires (RS6) sont ESTIMÉS côté serveur, et l'écran dit
 * comment, sur la période choisie (7, 30 ou 90 jours). Sous les règles,
 * les deux lignes « Calculé » (souvent pris avec, vos habituels) : leurs
 * commandées sortent du même partage que celles des règles. Une panne
 * des chiffres ou du catalogue n'efface pas la liste : elle se dit à côté.
 *
 * Les alertes (RS10) disent, sous la phrase d'une règle vivante, quel article
 * ne se vend plus et pourquoi ; « À corriger » ne garde qu'elles. Leur panne
 * se dit à côté, comme celle des chiffres.
 *
 * La liste est regroupée par état (RS9, `SuggestionRuleList`) ; « Dupliquer »
 * ouvre le panneau sur une copie, enregistrée comme une nouvelle règle.
 *
 * L'aperçu (RS5) se lit sous `lfc_suggestions:read`, comme la liste : il
 * dit ce que la boutique montrerait, et pourquoi une règle reste muette.
 *
 * Écrire (créer, modifier, dupliquer, couper, archiver, régler l'ordre) demande
 * `lfc_suggestions:write`.
 */
@Component({
  selector: 'app-suggestions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    SuggestionComputedResults,
    SuggestionOrderCard,
    SuggestionPreviewCard,
    SuggestionRuleList,
  ],
  templateUrl: './suggestions-page.html',
  styleUrl: './suggestions-page.scss',
})
export class SuggestionsPage {
  private readonly api = inject(StaffSuggestionsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rules = signal<readonly StaffSuggestionRuleView[]>([]);
  protected readonly choices = signal<StaffSuggestionChoicesView | null>(null);
  private readonly preview = viewChild(SuggestionPreviewCard);
  protected readonly counters = signal<ReadonlyMap<string, StaffSuggestionResultRow> | null>(null);
  protected readonly computedResults = signal<readonly ComputedSuggestionResultRow[] | null>(null);
  /** La période des chiffres (RS6) : 7, 30 ou 90 jours métier, aujourd'hui compris. */
  protected readonly days = signal<StaffSuggestionResultPeriod>(
    DEFAULT_STAFF_SUGGESTION_RESULT_PERIOD,
  );
  protected readonly periodOptions = RESULT_PERIOD_OPTIONS;
  protected readonly periodValue = computed(() => String(this.days()));
  protected readonly estimateHelp = ESTIMATE_HELP;
  private readonly catalogueFailed = signal(false);
  private readonly resultsFailed = signal(false);
  protected readonly alerts = signal<ReadonlyMap<string, StaffSuggestionRuleAlert> | null>(null);
  private readonly alertsFailed = signal(false);
  /** Le catalogue ou les chiffres manquent : la liste reste, la panne se dit. */
  protected readonly partialFailure = computed(() => {
    const problems = [
      ...(this.catalogueFailed()
        ? ['le catalogue n’a pas pu être lu : les articles se disent par leur référence']
        : []),
      ...(this.resultsFailed() ? ['les chiffres n’ont pas pu être lus'] : []),
      ...(this.alertsFailed() ? ['les alertes n’ont pas pu être lues'] : []),
    ];
    return problems.length === 0 ? null : `Affichage partiel : ${problems.join(' ; ')}.`;
  });
  protected readonly actionFailure = signal<string | null>(null);
  protected readonly pending = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('lfc_suggestions:write'));
  /** Aucune règle n'a encore été montrée en boutique : les chiffres restent à zéro. */
  protected readonly nothingCounted = computed(() => {
    const counted = this.counters();
    return counted !== null && [...counted.values()].every((row) => row.shown === 0);
  });

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
    try {
      this.choices.set(await this.api.choices());
      this.catalogueFailed.set(false);
    } catch {
      this.catalogueFailed.set(true);
    }
    await Promise.all([this.loadResults(), this.loadAlerts()]);
  }

  /** Les alertes (RS10) ; leur panne se dit à côté de la liste. */
  private async loadAlerts(): Promise<void> {
    try {
      const view = await this.api.alerts();
      this.alerts.set(new Map(view.rules.map((alert) => [alert.ruleId, alert])));
      this.alertsFailed.set(false);
    } catch {
      this.alerts.set(null);
      this.alertsFailed.set(true);
    }
  }

  /** Les chiffres de la période choisie ; leur panne se dit à côté de la liste. */
  private async loadResults(): Promise<void> {
    try {
      const view = await this.api.results(this.days());
      this.counters.set(new Map(view.rules.map((row) => [row.ruleId, row])));
      this.computedResults.set(view.computed);
      this.resultsFailed.set(false);
    } catch {
      this.counters.set(null);
      this.computedResults.set(null);
      this.resultsFailed.set(true);
    }
  }

  /** Une autre période : seuls les chiffres se relisent. */
  protected async choosePeriod(value: string): Promise<void> {
    const days = resultPeriodOf(value);
    if (days === null || days === this.days()) {
      return;
    }
    this.days.set(days);
    await this.loadResults();
  }

  /** Ce qu'une ligne demande. */
  protected onGesture({ kind, rule }: SuggestionGesture): Promise<void> {
    switch (kind) {
      case 'preview':
        return this.openPreview(rule);
      case 'edit':
        return this.edit(rule);
      case 'duplicate':
        return this.edit(rule, true);
      case 'toggle':
        return this.toggle(rule);
      case 'archive':
        return this.archive(rule);
    }
  }

  /**
   * Le panneau : une neuve (`null`), une règle à réécrire, ou sa copie
   * (`copy`, RS9) — qui s'enregistre comme une NOUVELLE règle, l'original
   * intact.
   */
  protected async edit(rule: StaffSuggestionRuleView | null, copy = false): Promise<void> {
    const choices = this.choices();
    if (choices === null) {
      this.actionFailure.set(
        'Le catalogue n’a pas pu être lu : rechargez la page avant de composer une suggestion.',
      );
      return;
    }
    const saved = await this.panels.open<SuggestionPanelData, string>(SuggestionPanel, {
      data: { rule, choices, copy },
    }).closed;
    if (saved !== undefined) {
      await this.reload();
    }
  }

  /** « Ouvrir l'aperçu » : l'emplacement, la clientèle et un déclencheur qui rendent la règle vraie. */
  private async openPreview(rule: StaffSuggestionRuleView): Promise<void> {
    await this.preview()?.openFor(previewSetupOf(rule, this.choices(), parisToday()));
  }

  private toggle(rule: StaffSuggestionRuleView): Promise<void> {
    return this.act(rule, () => this.api.setActive(rule.id, !rule.active));
  }

  private archive(rule: StaffSuggestionRuleView): Promise<void> {
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
