import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldSpinnerComponent,
  type FoldBadgeVariant,
} from 'fold-ng';

import type { PushSummary, ReconciliationRowView, ReconciliationStatus } from '@lfd/pim-contracts';
import { ShopifyApi } from '../../channels/shopify-api';
import { ReconciliationStore } from '../reconciliation-store';

interface StatusStyle {
  readonly label: string;
  readonly variant: FoldBadgeVariant;
  /** Dérive boutière ⚠️ — met la ligne en avant. */
  readonly alert?: boolean;
}

const STATUS_STYLE: Record<ReconciliationStatus, StatusStyle> = {
  never_published: { label: 'Jamais publié', variant: 'info' },
  up_to_date: { label: 'À jour', variant: 'success' },
  local_ahead: { label: 'À pousser', variant: 'info' },
  remote_drift: {
    label: 'Modifié en boutique',
    variant: 'warning',
    alert: true,
  },
  conflict: { label: 'Conflit', variant: 'alert', alert: true },
  to_remove: { label: 'À retirer', variant: 'alert' },
  unknown: { label: 'Boutique inconnue', variant: 'neutral' },
};

/** Statuts qu'on propose de pousser par défaut (sélection « tout actionnable »). */
const ACTIONABLE: ReadonlySet<ReconciliationStatus> = new Set([
  'never_published',
  'local_ahead',
  'conflict',
]);

/**
 * Le **tableau de réconciliation** Shopify — orienté handle. Par produit : le statut
 * à trois voies (BASE/OURS/THEIRS), le diff par paire au dépli, l'historique versionné
 * et son rollback. Actions : pré-push (aperçu sans effet de bord), publier, rétablir.
 * Tout vient du backend ({@link ReconciliationStore}) — le front ne simule rien.
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
    FoldSpinnerComponent,
  ],
  templateUrl: './publication-shopify.html',
  styleUrl: './publication-shopify.scss',
})
export class PublicationShopify {
  private readonly store = inject(ReconciliationStore);
  private readonly api = inject(ShopifyApi);

  protected readonly loading = this.store.loading;
  protected readonly error = this.store.error;
  protected readonly details = this.store.details;
  protected readonly histories = this.store.histories;

  protected readonly rows = computed(() => this.store.board()?.rows ?? []);
  protected readonly mode = computed(() => this.store.board()?.mode ?? 'dry-run');
  protected readonly isLive = computed(() => this.mode() === 'live');

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  /**
   * Les empreintes lues au dernier pré-push, par identifiant de produit.
   *
   * C'est le lien entre ce qu'on a relu et ce qu'on envoie : sans elles, les
   * deux gestes de cet écran sont deux appels que rien ne rattache, et on peut
   * publier une fiche que personne n'a regardée.
   */
  private readonly relu = signal<Readonly<Record<string, string>>>({});

  /** Les productIds pré-sélectionnés (actionnables, ayant un produit courant). */
  protected readonly actionableIds = computed(() =>
    this.rows().flatMap((row) =>
      row.productId !== null && ACTIONABLE.has(row.status) ? [row.productId] : [],
    ),
  );
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly allActionableSelected = computed(() => {
    const ids = this.actionableIds();
    return ids.length > 0 && ids.every((id) => this.selected().has(id));
  });

  protected style(status: ReconciliationStatus): StatusStyle {
    return STATUS_STYLE[status];
  }

  protected isSelected(productId: string): boolean {
    return this.selected().has(productId);
  }

  protected toggle(productId: string, on: boolean): void {
    const next = new Set(this.selected());
    if (on) {
      next.add(productId);
    } else {
      next.delete(productId);
    }
    this.selected.set(next);
  }

  protected toggleAll(on: boolean): void {
    this.selected.set(on ? new Set(this.actionableIds()) : new Set());
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
      // Chargement paresseux du détail + historique au premier dépli.
      void this.store.loadDetail(handle).catch(() => undefined);
      void this.store.loadHistory(handle).catch(() => undefined);
    }
    this.expanded.set(next);
  }

  /** Pré-push : aperçu de ce qui partirait, sans rien écrire ni appeler la boutique. */
  protected async prePush(): Promise<void> {
    const targets = [...this.selected()];
    if (targets.length === 0) {
      return;
    }
    this.busy.set(true);
    try {
      const summary = await this.api.push(targets, true);
      this.relu.set(Object.fromEntries(summary.results.map((r) => [r.productId, r.hash])));
      this.message.set(`Pré-push — ${this.summarize(summary)}`);
    } catch {
      this.message.set('Échec du pré-push (backend injoignable ?).');
    } finally {
      this.busy.set(false);
    }
  }

  /** Publie les produits sélectionnés puis recharge le tableau (état boutique frais). */
  protected async publish(): Promise<void> {
    const targets = [...this.selected()];
    if (targets.length === 0) {
      return;
    }
    this.busy.set(true);
    try {
      const summary = await this.api.push(targets, false, this.relu());
      const drifted = summary.results.filter((result) => result.outcome === 'drifted');
      this.message.set(`Publié — ${this.summarize(summary)}${this.describeTaxPass(summary)}`);

      // 🔴 Les empreintes ne sont vidées QUE si tout est parti. Un refus doit
      // survivre au clic : les garder fait que le geste suivant se heurte au
      // même refus, jusqu'à ce qu'on refasse un pré-push — le seul geste qui
      // rende la garde à nouveau valable. Les vider ici laisserait le second
      // clic passer sans aucune relecture, ce qui est précisément le trou
      // qu'elles ferment.
      if (drifted.length === 0) {
        this.relu.set({});
        this.selected.set(new Set());
      }
      await this.store.reload();
    } catch {
      this.message.set('Échec de la publication.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Rétablit un handle sur une version antérieure, puis rafraîchit sa vue. */
  protected async rollback(handle: string, version: number): Promise<void> {
    this.busy.set(true);
    try {
      const report = await this.api.rollback(handle, version);
      this.message.set(report.message);
      await this.store.reload();
      await this.store.loadDetail(handle);
      await this.store.loadHistory(handle);
    } catch {
      this.message.set('Échec du rollback.');
    } finally {
      this.busy.set(false);
    }
  }

  protected refresh(): void {
    void this.store.reload().catch(() => undefined);
  }

  protected trackRow(_index: number, row: ReconciliationRowView): string {
    return row.handle;
  }

  /**
   * La passe de collections de taxe, dite seulement quand elle a fait quelque
   * chose : à jour, elle n'a rien à raconter.
   */
  private describeTaxPass(summary: PushSummary): string {
    const pass = summary.taxCollections;
    if (pass === null) {
      return '';
    }
    if (pass.error !== null) {
      return ` ⚠ collections de taxe non vérifiées (${pass.error}).`;
    }
    return pass.created.length === 0
      ? ''
      : ` Collections de taxe créées : ${pass.created.join(', ')}.`;
  }

  private summarize(summary: PushSummary): string {
    const by = (outcome: string): number =>
      summary.results.filter((result) => result.outcome === outcome).length;
    const parts = [`${by('pushed')} concerné(s)`, `${by('unchanged')} déjà à jour`];
    const failed = by('failed');
    if (failed > 0) {
      parts.push(`${failed} échec(s)`);
    }
    // Nommé à part d'un échec : rien n'a raté, la fiche a simplement changé
    // depuis la relecture. Les confondre enverrait chercher une panne là où il
    // n'y a qu'à relire.
    const drifted = by('drifted');
    if (drifted > 0) {
      parts.push(`${drifted} modifiée(s) depuis votre relecture — refaites un pré-push`);
    }
    return `${parts.join(', ')}.`;
  }
}
