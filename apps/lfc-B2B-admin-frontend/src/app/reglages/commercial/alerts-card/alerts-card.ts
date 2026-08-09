import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldCardComponent } from 'fold-ng';

import { AcquisitionSettingsService } from '../../../commercial/settings/acquisition-settings.service';

/**
 * Section **Réglage des alertes** : les deux seuils (en jours d'attente
 * d'activation) qui font monter la couleur d'un dossier dans le calendrier
 * d'acquisition — neutre, puis ambre, puis rouge.
 *
 * ⚠️ Persistés en `localStorage` : par navigateur, donc **non partagés** entre
 * commerciaux. C'est une dette connue (P1-8 de la doc de release) ; l'écran le
 * dit plutôt que de laisser croire à un réglage d'équipe.
 */
@Component({
  selector: 'app-alerts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent],
  templateUrl: './alerts-card.html',
  styleUrl: './alerts-card.scss',
})
export class AlertsCard {
  protected readonly settings = inject(AcquisitionSettingsService);
}
