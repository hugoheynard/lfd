import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { SignInDialog } from '../../../login/sign-in-dialog/sign-in-dialog';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ProVisit } from '../pro-visit.service';

/** Où mène la connexion depuis le repère — la même porte que la landing `/pro`. */
const AFTER_SIGN_IN = '/mon-compte';

/**
 * **Le repère de la visite pro**, en haut de la boutique : il dit que les prix
 * sont les tarifs pro de base hors taxe — pas encore les conditions de la
 * société —, ouvre la connexion, et rend le taxe compris à qui le préfère.
 *
 * Rien à l'écran hors visite pro : le particulier ne voit pas de repère.
 */
@Component({
  selector: 'app-pro-visit-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './pro-visit-note.html',
})
export class ProVisitNote {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly visit = inject(ProVisit);
  private readonly panels = inject(FoldPanelHostService);

  protected signIn(): void {
    SignInDialog.open(this.panels, AFTER_SIGN_IN);
  }

  protected showTtc(): void {
    void this.visit.leave();
  }
}
