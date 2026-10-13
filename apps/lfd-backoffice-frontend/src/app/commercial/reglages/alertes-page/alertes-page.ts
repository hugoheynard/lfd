import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AccountAlertsCard } from '../../../reglages/commercial/account-alerts-card/account-alerts-card';
import { ActivationAlertsCard } from '../../../reglages/commercial/activation-alerts-card/activation-alerts-card';

/**
 * Les alertes : deux jeux de règles que le mot réunissait à tort — les alertes de compte client (un client qu'on a déjà) et les seuils du calendrier d'acquisition (un dossier pas encore traité).
 *
 * Vue de l'espace Commercial, sous sa section « Réglages » (Hugo,
 * 2026-10-13) : l'en-tête — titre, icône, description — est celui de la
 * coquille `CommercialPage`, lu dans `COMMERCIAL_VIEWS`. La page ne pose donc
 * pas de `fold-page-layout` à elle : elle vit déjà dans celui de la coquille.
 */
@Component({
  selector: 'app-alertes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AccountAlertsCard, ActivationAlertsCard],
  templateUrl: './alertes-page.html',
  styleUrl: './alertes-page.scss',
})
export class AlertesPage {}
