import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { OrderLineView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldEmptyStateComponent } from 'fold-ng';

import { PricePath } from '../../b2b/tarification/price-path/price-path';
import { REJECTION_LABELS, frozenChainOf } from './frozen-chain';

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
  imports: [PricePath, FoldCalloutComponent, FoldEmptyStateComponent],
  templateUrl: './price-explain.html',
  styleUrl: './price-explain.scss',
})
export class PriceExplain {
  readonly line = input.required<OrderLineView>();

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

  protected readonly rejected = computed<readonly RejectedLine[]>(() =>
    (this.line().pricing?.rejected ?? []).map((entry, index) => ({
      key: `${String(index)}-${entry.ruleId}`,
      label: entry.label,
      reason: REJECTION_LABELS[entry.cause],
    })),
  );
}
