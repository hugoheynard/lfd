import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent, FoldNumberInputComponent } from 'fold-ng';

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
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldNumberInputComponent],
  templateUrl: './alerts-card.html',
  styleUrl: './alerts-card.scss',
})
export class AlertsCard {
  protected readonly settings = inject(AcquisitionSettingsService);

  /** `fold-number-input` rend `null` quand le champ est vidé : un seuil vaut ≥ 1. */
  protected setWarn(value: number | null): void {
    this.settings.setWarnDays(value ?? 1);
  }

  protected setAlert(value: number | null): void {
    this.settings.setAlertDays(value ?? 1);
  }
}
