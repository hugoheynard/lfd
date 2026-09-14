import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldButtonComponent, FoldPanelHostService } from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { IdentityPanel } from '../identity-panel/identity-panel';
import { canEditIdentity } from '../identity-section';

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
  imports: [FoldButtonComponent],
  templateUrl: './identity-desk-card.html',
  styleUrl: './identity-desk-card.scss',
})
export class IdentityDeskCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly canEdit = computed(() => canEditIdentity(this.client.company()));

  protected open(): void {
    const company = this.client.company();
    if (company !== null) {
      IdentityPanel.open(this.panels, company);
    }
  }
}
