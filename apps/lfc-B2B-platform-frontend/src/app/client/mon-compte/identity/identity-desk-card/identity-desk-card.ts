import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldButtonComponent, FoldPanelHostService } from 'fold-ng';

import { CompletionCallout } from '../../completion/completion-callout/completion-callout';
import type { CompletionItem, CompletionTarget } from '../../completion/completion-items';
import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { IdentityPanel } from '../identity-panel/identity-panel';
import { canEditIdentity, legalFormLabelOf } from '../identity-section';

/**
 * La carte **Identité légale** du bureau : les cinq mentions, la règle écrite
 * sous elles, et « Modifier » aux rôles que l'API laisse écrire — qui ouvre le
 * panneau d'identité.
 *
 * Ce qui passe par nous le DIT. Aucun champ grisé : un champ mort se lit comme
 * une panne, une phrase se lit comme une règle.
 */
@Component({
  selector: 'app-identity-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompletionCallout, FoldButtonComponent],
  templateUrl: './identity-desk-card.html',
  styleUrl: './identity-desk-card.scss',
})
export class IdentityDeskCard {
  /** Ce qui manque dans cette carte (plan `plan-mon-compte-a-completer.md` §2.3) — la page le calcule. */
  readonly completion = input<readonly CompletionItem[]>([]);
  /** Compléter un élément : la page ouvre le dialogue de sa cible, le même que la synthèse du haut. */
  readonly completionAction = output<CompletionTarget>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  /** `sarl` se lit « SARL » ; une saisie que le catalogue ne reconnaît pas, telle quelle. */
  protected readonly formLabel = legalFormLabelOf;

  protected readonly canEdit = computed(() => canEditIdentity(this.client.company()));

  protected open(): void {
    const company = this.client.company();
    if (company !== null) {
      IdentityPanel.open(this.panels, company);
    }
  }
}
