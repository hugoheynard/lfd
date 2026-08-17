import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PriceRuleView } from '@lfd/contracts';

import { ruleSentence } from '../pricing-format';

/**
 * **Une règle, telle qu'elle se voit sur son nœud** — et telle qu'on agit
 * dessus.
 *
 * Extrait sur son deuxième usage réel : le nœud de famille et celui de l'article
 * affichaient la même chose à deux endroits, avec les mêmes trois gestes. La
 * troisième copie aurait divergé sur le cas qui compte — l'état suspendu.
 *
 * Deux marques distinctes, parce que ce sont deux faits sans rapport :
 * **supplantée** (une règle plus précise gagne son étage) est barrée ;
 * **en pause** (quelqu'un l'a arrêtée) est estompée. Les confondre laisserait
 * croire qu'une remise s'ajoute à une autre, ou qu'une promo tourne encore.
 */
@Component({
  selector: 'app-rule-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rule-chip.html',
  styleUrl: './rule-chip.scss',
  host: {
    '[class]': 'stageClass()',
    '[class.is-superseded]': 'superseded()',
    '[class.is-paused]': "rule().status === 'paused'",
  },
})
export class RuleChip {
  readonly rule = input.required<PriceRuleView>();
  /** Une règle d'article évince celle de la famille, dans le même étage. */
  readonly superseded = input(false);
  /** Le libellé commercial : montré sur le nœud de famille, tu sur celui de l'article. */
  readonly showLabel = input(false);

  readonly toggled = output<PriceRuleView>();
  readonly journalRequested = output<PriceRuleView>();
  readonly archiveRequested = output<PriceRuleView>();

  /**
   * Chaque étage garde **sa** couleur, dans l'ordre où il s'applique. Une
   * identité, jamais un rang : la teinte ne dit pas « plus important », elle dit
   * « pas le même moment ». Elle double le mot, qui est déjà dans le résumé —
   * la couleur n'est donc jamais seule à porter l'information.
   */
  protected readonly stageClass = computed(() => `is-stage-${this.rule().stage}`);

  /** Ce que la règle fait, en une ligne — la même phrase qu'à l'archivage. */
  protected readonly summary = computed(() => ruleSentence(this.rule()));

  protected readonly toggleLabel = computed(() =>
    this.rule().status === 'paused'
      ? `Reprendre ${this.rule().label}`
      : `Suspendre ${this.rule().label}`,
  );
}
