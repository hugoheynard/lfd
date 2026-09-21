import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { ClientCopyService } from '../../../copy/client-copy.service';
import { ClientFeatureAccess } from '../../../feature-access/client-feature-access.service';

/**
 * La carte **Mes données** du bureau : ce qu'on garde, et les deux gestes
 * irréversibles avec leur conséquence énoncée, dans leur propre territoire.
 *
 * ⚠️ **Ses quatre boutons n'ont aucune action**, et c'est leur état d'origine
 * (vérifié le 2026-09-14 sur `data-card.html` à `HEAD` : aucun `(click)`, et
 * aucune route client d'export, de transfert ni de fermeture). Ils sont
 * rétablis tels quels à la demande de Hugo — aucun geste du bureau ne
 * disparaît avec ce lot —, pas branchés : les brancher est un chantier.
 */
@Component({
  selector: 'app-data-desk-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './data-desk-card.html',
  styleUrl: './data-desk-card.scss',
})
export class DataDeskCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly access = inject(ClientFeatureAccess);
}
