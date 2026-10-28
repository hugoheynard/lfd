import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { DueThresholdView, ProductionDueThresholdsView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { ProductionService } from '../../production.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Une ligne du compte à rebours, prête à lire. */
export interface DueThresholdRow {
  readonly sku: string;
  readonly productName: string;
  readonly total: number;
  /** « 120 avant 04:40 · 180 avant 08:10 », ou « 120 dans la journée ». */
  readonly countdown: string;
  /** Ce qui n'a pas d'échéance, à signaler ; `0` s'il n'y en a pas. */
  readonly undated: number;
  /**
   * En tranches fixes, les besoins d'avant la première tranche, à signaler :
   * « 120 attendus à 04:30, avant la première tranche » ; `null` sinon.
   */
  readonly beforeFirst: string | null;
}

/** Le libellé d'un seuil daté ou de la journée ; `null` pour le seuil sans échéance. */
export function thresholdLabel(threshold: DueThresholdView): string | null {
  switch (threshold.kind) {
    case 'deadline':
    case 'before_first':
      return `${threshold.cumulative} avant ${threshold.before ?? '?'}`;
    case 'day':
      return `${threshold.cumulative} dans la journée`;
    case 'undated':
      return null;
  }
}

/** « 120 attendus à 04:30, avant la première tranche », ou `null`. */
export function beforeFirstLabel(thresholds: readonly DueThresholdView[]): string | null {
  const early = thresholds.find((threshold) => threshold.kind === 'before_first');
  if (early === undefined) {
    return null;
  }
  return `${early.quantity} attendus à ${early.earliest ?? early.before ?? '?'}, avant la première tranche`;
}

/** Le mode des tranches, tel qu'il se lit dans un titre. */
export function trancheModeLabel(view: ProductionDueThresholdsView): string {
  return view.trancheMode === 'fixed' ? 'Tranches fixes' : 'Tranches calculées';
}

/**
 * Les lignes du serveur, dans l'ordre du nom — l'ordre d'affichage appartient
 * à l'écran. Les seuils, eux, sont lus tels que servis : déjà rangés selon le
 * mode (plan `fournil/plan-tranches-de-production.md`, §5).
 */
export function dueThresholdRows(view: ProductionDueThresholdsView): readonly DueThresholdRow[] {
  return [...view.lines]
    .sort((a, b) => a.productName.localeCompare(b.productName, 'fr'))
    .map((line) => ({
      sku: line.sku,
      productName: line.productName,
      total: line.total,
      countdown: line.thresholds
        .map(thresholdLabel)
        .filter((label): label is string => label !== null)
        .join(' · '),
      undated: line.thresholds
        .filter((threshold) => threshold.kind === 'undated')
        .reduce((sum, threshold) => sum + threshold.quantity, 0),
      beforeFirst: beforeFirstLabel(line.thresholds),
    }));
}

/**
 * **Le compte à rebours** d'une journée — ce qui doit être sorti de chaque
 * produit avant chaque échéance, cumulé (plan
 * `documentation/fournil/plan-tranches-de-production.md`, V0 et §7.2).
 *
 * Lecture seule, et une prévision : rien n'y est coché, le « sorti » vient
 * avec V1. Sans les deux marges réglées, le serveur ne rend qu'un seuil « la
 * journée », et l'écran dit pourquoi, avec le chemin du réglage.
 */
@Component({
  selector: 'app-due-thresholds-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './due-thresholds-section.html',
  styleUrl: './due-thresholds-section.scss',
})
export class DueThresholdsSection {
  private readonly production = inject(ProductionService);

  /** La journée de service, `AAAA-MM-JJ`. */
  readonly date = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  private readonly view = signal<ProductionDueThresholdsView | null>(null);

  protected readonly rows = computed(() => {
    const view = this.view();
    return view === null ? [] : dueThresholdRows(view);
  });

  /** « Le compte à rebours · Tranches fixes » — le mode réglé dans le titre. */
  protected readonly title = computed(() => {
    const view = this.view();
    return view === null
      ? 'Le compte à rebours'
      : `Le compte à rebours · ${trancheModeLabel(view)}`;
  });

  /** Une marge manque : le serveur n'a rendu que « la journée ». */
  protected readonly marginsMissing = computed(() => {
    const view = this.view();
    return (
      view !== null && (view.deliveryMarginMinutes === null || view.pickupMarginMinutes === null)
    );
  });

  /** « livraison 90 min · retrait 30 min » — à côté de quoi lire les heures. */
  protected readonly marginsLabel = computed(() => {
    const view = this.view();
    if (view === null) {
      return 'Ce qui doit être sorti avant chaque échéance, cumulé.';
    }
    // Facultatives aux Réglages, et voulues telles : on le dit sans le
    // réclamer — un bandeau dans le dossier se lisait comme un oubli (Hugo,
    // 2026-10-21).
    if (view.trancheMode === 'fixed' && view.fixedTranches.length === 0) {
      return 'Tranches fixes sans heure réglée : une seule tranche, la journée (Réglages › Production).';
    }
    const tranches =
      view.trancheMode === 'fixed' ? ` · tranches ${view.fixedTranches.join(', ')}` : '';
    if (this.marginsMissing()) {
      return `Marges non réglées, comptées à zéro : l’heure promise au client (Réglages › Zones de livraison)${tranches}`;
    }
    return `Marges : livraison ${view.deliveryMarginMinutes} min · retrait ${view.pickupMarginMinutes} min${tranches}`;
  });

  constructor() {
    effect(() => {
      void this.load(this.date());
    });
  }

  protected async load(date: string = this.date()): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.production.dueThresholds(date));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
