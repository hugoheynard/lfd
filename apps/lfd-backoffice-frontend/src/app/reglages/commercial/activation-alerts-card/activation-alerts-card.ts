import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent, FoldNumberInputComponent } from 'fold-ng';

import { AcquisitionSettingsService } from '../../../commercial/settings/acquisition-settings.service';

/**
 * Section **Alertes d'activation** : les deux seuils (en jours d'attente
 * d'activation) qui font monter la couleur d'un dossier dans le calendrier
 * d'acquisition — neutre, puis ambre, puis rouge.
 *
 * ⚠️ À ne pas confondre avec les **alertes de compte client** (la carte voisine),
 * qui surveillent les commandes d'un compte déjà actif. Les deux vivaient sous
 * le même nom d'« alertes » ; celle-ci parle d'un dossier qu'on n'a pas encore
 * traité, celle-là d'un client qu'on a déjà.
 *
 * ⚠️ Persistés en `localStorage` : par navigateur, donc **non partagés** entre
 * commerciaux. C'est une dette connue (P1-8 de la doc de release) ; l'écran le
 * dit plutôt que de laisser croire à un réglage d'équipe.
 */
@Component({
  selector: 'app-activation-alerts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldNumberInputComponent],
  templateUrl: './activation-alerts-card.html',
  styleUrl: './activation-alerts-card.scss',
})
export class ActivationAlertsCard {
  protected readonly settings = inject(AcquisitionSettingsService);

  /** `fold-number-input` rend `null` quand le champ est vidé : un seuil vaut ≥ 1. */
  protected setWarn(value: number | null): void {
    this.settings.setWarnDays(value ?? 1);
  }

  protected setAlert(value: number | null): void {
    this.settings.setAlertDays(value ?? 1);
  }
}
