import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PlanVersionDiffView, PlanVersionMarkView, PlanVersionView } from '@lfd/contracts';
import { FoldBadgeComponent, FoldCalloutComponent, FoldEmptyStateComponent } from 'fold-ng';

import {
  amountLabel,
  causeLabel,
  changeSentence,
  markAuthor,
  resupplySentence,
  signedDelta,
  toCheckSentence,
  withAuthor,
} from '../../plan-versions/plan-version-wording';

/** Une ligne de l'effet sur la production, déjà dite. */
interface EffectRow {
  readonly sku: string;
  readonly productName: string;
  readonly before: string;
  readonly after: string;
  readonly delta: string;
}

/** Une phrase du diff, avec la version qui l'a faite. */
interface Sentence {
  readonly key: string;
  readonly version: number;
  readonly cause: string;
  readonly text: string;
}

/**
 * **La comparaison de deux versions du plan**
 * (`documentation/fournil/plan-historique-des-tirages.md`, § 1.16 à 1.21) :
 * l'effet sur la production par produit, les sorties dont la raison est au
 * commerce (« à vérifier », en orange), puis chaque changement expliqué, avec
 * la version qui l'a fait et son auteur. Le diff ne nomme pas les auteurs par
 * l'annuaire : ils se relisent dans la liste (`versions`), par numéro.
 */
@Component({
  selector: 'app-plan-version-diff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldCalloutComponent, FoldEmptyStateComponent],
  templateUrl: './plan-version-diff.html',
  styleUrl: './plan-version-diff.scss',
})
export class PlanVersionDiff {
  readonly diff = input.required<PlanVersionDiffView>();
  /** La liste de la journée : les auteurs nommés. */
  readonly versions = input.required<readonly PlanVersionView[]>();

  protected readonly effects = computed<readonly EffectRow[]>(() =>
    this.diff().production.map((effect) => ({
      sku: effect.sku,
      productName: effect.productName,
      before: amountLabel(effect.before, effect.saleUnit),
      after: amountLabel(effect.after, effect.saleUnit),
      delta: signedDelta(effect.delta, effect.saleUnit),
    })),
  );

  protected readonly toCheck = computed<readonly Sentence[]>(() =>
    this.diff().toCheck.map((exit, index) =>
      this.sentence(`check-${index}`, exit.by, toCheckSentence(exit)),
    ),
  );

  protected readonly changes = computed<readonly Sentence[]>(() => [
    ...this.diff().changes.map((change, index) =>
      this.sentence(`change-${index}`, change.by, changeSentence(change)),
    ),
    ...this.diff().resupplies.map((change, index) =>
      this.sentence(`resupply-${index}`, change.by, resupplySentence(change)),
    ),
  ]);

  /** Rien n'a bougé entre les deux versions. */
  protected readonly unchanged = computed(
    () => this.effects().length === 0 && this.toCheck().length === 0 && this.changes().length === 0,
  );

  private sentence(key: string, by: PlanVersionMarkView, text: string): Sentence {
    return {
      key,
      version: by.version,
      cause: causeLabel(by.cause),
      text: withAuthor(text, markAuthor(by, this.versions())),
    };
  }
}
