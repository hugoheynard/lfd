import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import type { ProductionProblemView } from '@lfd/contracts';

import { serverMessageOf } from '../../production/server-message';
import { hourLabel } from '../../production/worksheet-day';
import { GestureIntents } from '../../shared/gesture-intents';
import { SupervisionService } from '../supervision.service';

/**
 * **Les problèmes ouverts du fournil** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.8) — en tête de la
 * colonne Préparation, en rouge jusqu'à ce qu'un responsable les marque
 * traités. Une carte par rouge : le produit, l'attendu, le sorti déclaré, ce
 * que les fournées disent maintenant, la raison et depuis quand.
 *
 * « Marquer traité » part sous la clé d'une {@link GestureIntents} par
 * problème ; un succès fait relire la liste (`resolved`), un refus reste
 * écrit au-dessus des cartes.
 */
@Component({
  selector: 'app-production-problems',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './production-problems.html',
  styleUrl: './production-problems.scss',
})
export class ProductionProblems {
  private readonly api = inject(SupervisionService);
  private readonly intents = new GestureIntents();

  readonly problems = input.required<readonly ProductionProblemView[]>();
  /** `b2b_supervision:write` : « Marquer traité ». */
  readonly canResolve = input(false);
  /** Un problème vient d'être traité : la page relit. */
  readonly resolved = output<void>();

  /** Le problème dont « Marquer traité » est en vol. */
  protected readonly resolving = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);

  /** « Attendu 120 · sorti 80 » — et ce que disent les fournées s'il reste un écart. */
  protected figures(problem: ProductionProblemView): string {
    const said = `Attendu ${String(problem.expected)} · sorti ${String(problem.produced)}`;
    return problem.output > problem.produced
      ? `${said} · encore ${String(problem.output)} déclarées : l'écart reste à régler`
      : said;
  }

  /** « depuis 9 h 12 · par Léa Martin » */
  protected since(problem: ProductionProblemView): string {
    const at = hourLabel(problem.reportedAt);
    const since = at === null ? '' : `depuis ${at}`;
    const by = problem.reportedByName === null ? '' : `par ${problem.reportedByName}`;
    return [since, by].filter((part) => part !== '').join(' · ');
  }

  protected async resolve(problem: ProductionProblemView): Promise<void> {
    if (this.resolving() !== null) {
      return;
    }
    const subject = `resolve|${problem.id}|${String(problem.version)}`;
    this.resolving.set(problem.id);
    this.refusal.set(null);
    try {
      await this.api.resolveProductionProblem(problem.id, this.intents.keyFor(subject));
    } catch (error) {
      this.refusal.set(
        `${problem.productName} n'a pas été marqué traité : ${serverMessageOf(error)}`,
      );
      this.resolving.set(null);
      return;
    }
    this.intents.done(subject);
    this.resolving.set(null);
    this.resolved.emit();
  }
}
