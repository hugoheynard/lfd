import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { CompletionCallout } from '../../completion/completion-callout/completion-callout';
import type { CompletionItem, CompletionTarget } from '../../completion/completion-items';
import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { KbisPanel } from '../kbis-panel/kbis-panel';
import { kbisActionLabel, kbisStateLabel } from '../kbis-section';

/**
 * La carte **KBIS** en pile : l'état, le nom du fichier s'il existe, et le
 * bouton qui ouvre le panneau — « Déposer » à qui peut déposer et n'a rien
 * déposé, « Voir » à tous les autres.
 */
@Component({
  selector: 'app-kbis-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompletionCallout, CardFoot],
  templateUrl: './kbis-mobile-card.html',
  styleUrl: './kbis-mobile-card.scss',
})
export class KbisMobileCard {
  /** Ce qui manque dans cette carte (plan `plan-mon-compte-a-completer.md` §2.3) — la page le calcule. */
  readonly completion = input<readonly CompletionItem[]>([]);
  /** Compléter un élément : la page ouvre le dialogue de sa cible, le même que la synthèse du haut. */
  readonly completionAction = output<CompletionTarget>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly kbis = computed(() => this.client.company()?.kbis ?? null);
  protected readonly state = computed(() => kbisStateLabel(this.kbis(), this.t().account));

  protected readonly action = computed(() => {
    const company = this.client.company();
    return company === null ? '' : kbisActionLabel(company, this.t().account);
  });

  protected open(): void {
    const company = this.client.company();
    if (company !== null) {
      KbisPanel.open(this.panels, company);
    }
  }
}
