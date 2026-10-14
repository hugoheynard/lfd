import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { ProductionService } from '../../production.service';
import { serverMessageOf } from '../../server-message';

/**
 * **Rouvrir la journée** (Hugo, 2026-10-14) — le geste qui défait un arrêt
 * du plan, au Prod manager : c'est lui qui décide de ce qui part en fournée,
 * pas la fiche d'atelier.
 *
 * La confirmation dit l'EFFET, pas le mécanisme : les clients peuvent de
 * nouveau commander, et le plan sera refait au prochain arrêt. Le refus du
 * serveur (une fournée, un colisage, une tournée a commencé) est affiché tel
 * quel : il nomme le cas et la sortie, et c'est tout ce que la personne doit
 * savoir.
 *
 * Le parent ne le pose que pour qui tient `production_count_stop:write` (le
 * droit de l'arrêt) et sur une journée arrêtée.
 */
@Component({
  selector: 'app-reopen-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent],
  templateUrl: './reopen-day.html',
})
export class ReopenDay {
  private readonly production = inject(ProductionService);
  private readonly notify = inject(NotifyService);

  /** `AAAA-MM-JJ`. */
  readonly date = input.required<string>();
  /** « jeudi 15 octobre » — la journée dite comme l'équipe la dit. */
  readonly label = input.required<string>();
  /** Émis après une réouverture acceptée : le parent relit. */
  readonly reopened = output<void>();

  protected readonly confirming = signal(false);
  protected readonly reopening = signal(false);
  /** Le refus du serveur, tel quel — `null` tant qu'il n'y en a pas. */
  protected readonly refusal = signal<string | null>(null);

  protected ask(): void {
    this.refusal.set(null);
    this.confirming.set(true);
  }

  protected async reopen(): Promise<void> {
    this.reopening.set(true);
    try {
      const done = await this.production.reopenDay(this.date());
      const n = done.released;
      this.notify.success(
        `Journée du ${this.label()} rouverte : ${n} commande${n > 1 ? 's' : ''} retirée${n > 1 ? 's' : ''} du plan.`,
      );
      this.confirming.set(false);
      this.reopened.emit();
    } catch (error: unknown) {
      this.refusal.set(serverMessageOf(error));
      this.confirming.set(false);
    } finally {
      this.reopening.set(false);
    }
  }
}
