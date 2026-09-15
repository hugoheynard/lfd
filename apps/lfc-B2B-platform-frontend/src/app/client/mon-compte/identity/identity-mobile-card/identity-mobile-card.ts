import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { IdentityPanel } from '../identity-panel/identity-panel';
import { canEditIdentity } from '../identity-section';

/**
 * La carte **Identité légale** en pile : enseigne, raison sociale, SIRET, SIREN — ce
 * qu'on veut savoir sans ouvrir. La forme, la TVA et la règle sont dans le
 * panneau, que le bouton ouvre en écriture aux rôles qui écrivent, en lecture
 * aux autres.
 */
@Component({
  selector: 'app-identity-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFoot],
  templateUrl: './identity-mobile-card.html',
  styleUrl: './identity-mobile-card.scss',
})
export class IdentityMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly action = computed(() =>
    canEditIdentity(this.client.company()) ? this.t().account.edit : this.t().account.details,
  );

  protected open(): void {
    const company = this.client.company();
    if (company !== null) {
      IdentityPanel.open(this.panels, company);
    }
  }
}
