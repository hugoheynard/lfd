import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { OrderLineView, UnexplainedRuleView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldEmptyStateComponent, FoldLoadingStateComponent } from 'fold-ng';

import { PricePath } from '../../b2b/tarification/price-path/price-path';
import { AdminOrdersService } from '../orders.service';
import { REJECTION_LABELS, UNEXPLAINED_LABELS, frozenChainOf } from './frozen-chain';

/** Une règle écartée, mise en phrase pour l'écran. */
interface RejectedLine {
  readonly key: string;
  readonly label: string;
  readonly reason: string;
}

/**
 * **Pourquoi cette ligne a été facturée à ce prix** — la trace figée, dépliée.
 *
 * Le comptoir seul : `/admin/orders/:id` sert la trace entière, tandis que les
 * routes clientes sont rétrécies (R27). Ce panneau montre donc des choses que le
 * client ne voit pas — le nom de chaque règle, et celles qui ont été écartées.
 *
 * 🔴 **Il ne recalcule rien.** Tout vient de ce qui a été consigné à la
 * passation. C'est la promesse centrale du dossier : un prix qu'on peut défendre
 * six mois plus tard, quand les règles qui l'ont produit ont changé.
 */
@Component({
  selector: 'app-price-explain',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PricePath, FoldCalloutComponent, FoldEmptyStateComponent, FoldLoadingStateComponent],
  templateUrl: './price-explain.html',
  styleUrl: './price-explain.scss',
})
export class PriceExplain {
  readonly line = input.required<OrderLineView>();
  /** La commande dont vient cette ligne — la reconstruction se lit par sa date. */
  readonly orderId = input.required<string>();

  /** Refermer le panneau, donc désélectionner la ligne — un seul geste. */
  readonly dismissed = output<void>();

  protected readonly chain = computed(() => frozenChainOf(this.line()));

  /**
   * 🔴 **Les trois états, et c'est ici qu'on les perd ou qu'on les tient.**
   *
   * `null` = la ligne est **antérieure** à la colonne : on ne consignait pas les
   * règles écartées. L'afficher comme « aucune règle écartée » détruirait la
   * distinction que toute la colonne construit — et personne ne s'en
   * apercevrait, puisque les deux se dessinent pareil (R25).
   */
  protected readonly consigned = computed(() => this.line().pricing?.rejected !== null);

  private readonly api = inject(AdminOrdersService);

  /**
   * **L'autre moitié**, celle qui n'est pas figée : les décisions en vigueur ce
   * jour-là dont la ligne ne parle pas.
   *
   * Chargée au clic et pas avec la commande : c'est la lecture d'un tableau
   * daté, et la greffer sur l'écran la ferait payer à chaque ouverture.
   */
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly unexplained = signal<readonly UnexplainedRuleView[] | null>(null);

  constructor() {
    effect(() => {
      void this.loadUnexplained(this.orderId(), this.line().sku);
    });
  }

  private async loadUnexplained(orderId: string, sku: string): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      this.unexplained.set((await this.api.lineRules(orderId, sku)).rules);
    } catch {
      // 🔴 On ne retombe PAS sur une liste vide : vide affirme « rien d'autre
      // n'était en vigueur », et une panne de lecture n'affirme rien.
      this.unexplained.set(null);
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly unexplainedLines = computed<readonly RejectedLine[]>(() =>
    (this.unexplained() ?? []).map((entry, index) => ({
      key: `${String(index)}-${entry.ruleId}`,
      label: entry.label,
      reason: entry.cause === null ? UNEXPLAINED_LABELS.unknown : UNEXPLAINED_LABELS[entry.cause],
    })),
  );

  protected readonly rejected = computed<readonly RejectedLine[]>(() =>
    (this.line().pricing?.rejected ?? []).map((entry, index) => ({
      key: `${String(index)}-${entry.ruleId}`,
      label: entry.label,
      reason: REJECTION_LABELS[entry.cause],
    })),
  );
}
