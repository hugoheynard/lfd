import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldButtonComponent, FoldIconComponent, FoldPanelHostService } from 'fold-ng';

import { CompletionCallout } from '../../completion/completion-callout/completion-callout';
import type { CompletionItem, CompletionTarget } from '../../completion/completion-items';
import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { UserAddPanel } from '../user-add-panel/user-add-panel';
import { UsersList } from '../users-list/users-list';
import { canManageContacts, contactCount } from '../users-section';

/**
 * La carte **Utilisateurs** du bureau : le compte, la liste entière, et
 * « Ajouter un utilisateur ou un contact » — qui n'ouvrait rien, et ouvre
 * désormais le panneau d'ajout, aux seuls rôles que l'API laisse écrire.
 */
@Component({
  selector: 'app-users-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompletionCallout, FoldButtonComponent, FoldIconComponent, UsersList],
  templateUrl: './users-desk-card.html',
  styleUrl: './users-desk-card.scss',
})
export class UsersDeskCard {
  /** Ce qui manque dans cette carte (plan `plan-mon-compte-a-completer.md` §2.3) — la page le calcule. */
  readonly completion = input<readonly CompletionItem[]>([]);
  /** Compléter un élément : la page ouvre le dialogue de sa cible, le même que la synthèse du haut. */
  readonly completionAction = output<CompletionTarget>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly count = computed(() => contactCount(this.client.company()));
  protected readonly canAdd = computed(() => canManageContacts(this.client.company()));

  protected openAdd(): void {
    const company = this.client.company();
    if (company !== null) {
      UserAddPanel.open(this.panels, company);
    }
  }
}
