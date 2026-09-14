import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { UserAddPanel } from '../user-add-panel/user-add-panel';
import { UsersList } from '../users-list/users-list';
import { UsersPanel } from '../users-panel/users-panel';
import { canManageContacts } from '../users-section';

/**
 * La carte **Utilisateurs** en pile : la carte bleue du détenteur, telle
 * quelle, puis deux boutons — « Voir le détail » ouvre la liste entière,
 * « Ajouter un utilisateur » le panneau d'ajout, aux seuls rôles qui écrivent
 * (demande de Hugo, 2026-09-14).
 */
@Component({
  selector: 'app-users-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFoot, UsersList],
  templateUrl: './users-mobile-card.html',
  styleUrl: './users-mobile-card.scss',
})
export class UsersMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly canAdd = computed(() => canManageContacts(this.client.company()));

  protected openList(): void {
    UsersPanel.open(this.panels);
  }

  protected openAdd(): void {
    const company = this.client.company();
    if (company !== null) {
      UserAddPanel.open(this.panels, company);
    }
  }
}
