import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  type FoldBadgeVariant,
} from 'fold-ng';

import { PublicationApi } from '../../channels/publication-api';
import type { PlanEntry, PublicationStatus } from '../../data/publication';

interface StatusStyle {
  label: string;
  variant: FoldBadgeVariant;
}

const STATUS_STYLE: Record<PublicationStatus, StatusStyle> = {
  new: { label: 'Nouvelle', variant: 'info' },
  drifted: { label: 'Modifiée', variant: 'warning' },
  'up-to-date': { label: 'À jour', variant: 'success' },
  'to-remove': { label: 'À retirer', variant: 'alert' },
};

/**
 * Le **catalogue Shopify** en staging : les fiches projetées avec leur statut de
 * synchro, le diff au dépli, la sélection par fiche, et les actions — pré-push
 * (dry-run), approuver & pousser, programmer. Vit dans l'onglet Shopify du hub
 * Publication.
 */
@Component({
  selector: 'app-publication-shopify',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './publication-shopify.html',
  styleUrl: './publication-shopify.scss',
})
export class PublicationShopify {
  private readonly pub = inject(PublicationApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly plan = this.pub.plan;
  protected readonly scheduled = this.pub.scheduled;

  /** Fiches qui demandent une action (tout sauf « à jour »). */
  protected readonly actionable = computed(() =>
    this.plan().entries.filter((e) => e.status !== 'up-to-date'),
  );

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  /** Résumé du dernier pré-push (dry-run), effacé dès qu'on pousse. */
  protected readonly dryRun = signal<string | null>(null);
  protected readonly scheduling = signal(false);
  protected readonly scheduleAt = signal('');

  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly allActionableSelected = computed(() => {
    const act = this.actionable();
    return act.length > 0 && act.every((e) => this.selected().has(e.handle));
  });

  constructor() {
    // Un push programmé arrivé à échéance s'applique à l'ouverture.
    if (this.isBrowser) {
      this.pub.runDueSchedule(new Date().toISOString());
    }
    // Sélection initiale : tout ce qui demande une action.
    this.selected.set(new Set(this.actionable().map((e) => e.handle)));
  }

  protected style(status: PublicationStatus): StatusStyle {
    return STATUS_STYLE[status];
  }

  protected modeLabel(entry: PlanEntry): string {
    return entry.fiche.mode === 'emporter' ? 'À emporter' : 'Sur place';
  }

  protected modeVariant(entry: PlanEntry): FoldBadgeVariant {
    return entry.fiche.mode === 'emporter' ? 'accent' : 'info';
  }

  protected isSelected(handle: string): boolean {
    return this.selected().has(handle);
  }

  protected toggle(handle: string, on: boolean): void {
    const next = new Set(this.selected());
    if (on) {
      next.add(handle);
    } else {
      next.delete(handle);
    }
    this.selected.set(next);
  }

  protected toggleAll(on: boolean): void {
    this.selected.set(
      on ? new Set(this.actionable().map((e) => e.handle)) : new Set(),
    );
  }

  protected isExpanded(handle: string): boolean {
    return this.expanded().has(handle);
  }

  protected toggleExpand(handle: string): void {
    const next = new Set(this.expanded());
    if (next.has(handle)) {
      next.delete(handle);
    } else {
      next.add(handle);
    }
    this.expanded.set(next);
  }

  /** Fiches sélectionnées qui demandent une action — la cible réelle d'un push. */
  private targets(): string[] {
    return this.actionable()
      .filter((e) => this.selected().has(e.handle))
      .map((e) => e.handle);
  }

  protected prePush(): void {
    const t = this.targets();
    if (t.length === 0) {
      this.dryRun.set('Aucune fiche sélectionnée à pousser.');
      return;
    }
    const c = this.plan().counts;
    this.dryRun.set(
      `Dry-run : ${t.length} fiche(s) partiraient — ${c.new} nouvelle(s), ` +
        `${c.drifted} modifiée(s), ${c['to-remove']} à retirer. Aucun appel réseau.`,
    );
  }

  protected approveAndPush(): void {
    const t = this.targets();
    if (t.length === 0) {
      return;
    }
    this.pub.approveAndPush(t);
    this.dryRun.set(null);
    this.selected.set(new Set());
  }

  protected openSchedule(): void {
    this.scheduling.set(true);
  }

  protected confirmSchedule(): void {
    const at = this.scheduleAt().trim();
    const t = this.targets();
    if (at === '' || t.length === 0) {
      return;
    }
    // `datetime-local` est sans fuseau — on le fige en ISO local.
    this.pub.schedule(new Date(at).toISOString(), t);
    this.scheduling.set(false);
  }

  protected cancelSchedule(): void {
    this.scheduling.set(false);
    this.pub.cancelSchedule();
  }
}
