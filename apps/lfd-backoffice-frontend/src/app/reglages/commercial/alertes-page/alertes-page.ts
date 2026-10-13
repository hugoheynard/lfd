import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldPageLayoutComponent } from 'fold-ng';

import { AccountAlertsCard } from '../account-alerts-card/account-alerts-card';
import { ActivationAlertsCard } from '../activation-alerts-card/activation-alerts-card';

/**
 * Les alertes : deux jeux de règles que le mot réunissait à tort — les alertes de compte client (un client qu'on a déjà) et les seuils du calendrier d'acquisition (un dossier pas encore traité).
 *
 * Réglages › Commercial depuis le 2026-10-13 (Hugo) — venue de la section
 * « Réglages » de l'espace Commercial. La coquille des Réglages ne dessine
 * rien : la page porte donc son `fold-page-layout`, et son titre, son icône et
 * sa description ne s'affichent qu'une fois.
 */
@Component({
  selector: 'app-alertes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AccountAlertsCard, ActivationAlertsCard, FoldPageLayoutComponent],
  templateUrl: './alertes-page.html',
  styleUrl: './alertes-page.scss',
})
export class AlertesPage {}
