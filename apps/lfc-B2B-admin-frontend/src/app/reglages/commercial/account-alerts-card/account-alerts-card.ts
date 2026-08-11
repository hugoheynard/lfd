import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent, FoldLoadingStateComponent } from 'fold-ng';
import type { AlertRule, AlertRuleView } from '@lfd/contracts';

import { NotifyService } from '../../../notify.service';

import { AlertRulesService } from './alert-rules.service';
import { AlertRuleRow } from './alert-rule-row/alert-rule-row';

/**
 * Section **Alertes compte client** : ce que la plateforme surveille chez tous
 * les comptes — un produit jamais pris, un écart à la moyenne du client.
 *
 * Ces réglages sont **globaux**. Un compte peut y déroger depuis sa fiche
 * (onglet Alertes) ; l'écran le dit, sans quoi on croirait régler la plateforme
 * entière alors qu'un compte suit peut-être sa propre règle.
 *
 * ⚠️ Ne pas confondre avec les **alertes d'activation** (la carte voisine), qui
 * colorent un dossier en attente de traitement. Celle-ci parle d'un client
 * qu'on a déjà.
 */
@Component({
  selector: 'app-account-alerts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldLoadingStateComponent, AlertRuleRow],
  templateUrl: './account-alerts-card.html',
  styleUrl: './account-alerts-card.scss',
})
export class AccountAlertsCard {
  private readonly service = inject(AlertRulesService);
  private readonly notify = inject(NotifyService);

  protected readonly rules = signal<AlertRuleView[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** Le type en cours d'écriture — une règle s'enregistre seule, pas la carte. */
  protected readonly saving = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      this.rules.set(await this.service.list());
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Enregistre une règle, puis **relit** : le serveur date l'écriture, et c'est
   * cette date que la ligne affiche. La recalculer ici la ferait diverger du
   * moment réel de l'écriture.
   */
  protected async saveRule(rule: AlertRule): Promise<void> {
    this.saving.set(rule.params.kind);
    try {
      await this.service.save(rule);
      this.rules.set(await this.service.list());
      this.notify.success('Règle d’alerte enregistrée.');
    } catch (error) {
      this.notify.error(error, "L'enregistrement de la règle a échoué.");
    } finally {
      this.saving.set(null);
    }
  }
}
