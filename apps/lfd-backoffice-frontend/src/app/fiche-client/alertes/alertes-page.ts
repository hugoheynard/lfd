import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent } from 'fold-ng';
import type {
  AccountAlertOverride,
  AccountAlertRuleView,
  AccountAlertView,
  AlertKind,
} from '@lfd/contracts';

import { NotifyService } from '../../notify.service';

import { AccountAlertRulesService } from './account-alert-rules.service';
import { AccountAlertCard } from './account-alert-card/account-alert-card';
import { AlertJournal } from './alert-journal/alert-journal';

/**
 * Onglet **Alertes** d'un compte : ce que la plateforme surveille chez lui, et ce
 * que ce compte fait de chaque règle.
 *
 * L'écran ne calcule **rien** : le serveur rend ensemble la règle globale, la
 * dérogation et l'effectif. Recalculer `dérogation ?? global` ici donnerait une
 * seconde implémentation de la même décision, qui finirait par diverger de celle
 * qui compte — celle qui évalue vraiment les commandes.
 *
 * Chaque écriture est suivie d'une **relecture** : une dérogation touche trois
 * champs affichés (l'état, l'effectif, le rappel), et les recomposer à la main
 * côté client, c'est réimplémenter la résolution qu'on vient justement de refuser.
 */
@Component({
  selector: 'app-client-alertes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldLoadingStateComponent,
    AccountAlertCard,
    AlertJournal,
    FoldButtonComponent,
    FoldEmptyStateComponent,
  ],
  templateUrl: './alertes-page.html',
  styleUrl: './alertes-page.scss',
})
export class ClientAlertesPage {
  /** L'identifiant de la société, lié depuis le segment de route parent. */
  readonly id = input.required<string>();

  private readonly service = inject(AccountAlertRulesService);
  private readonly notify = inject(NotifyService);

  protected readonly rules = signal<AccountAlertRuleView[]>([]);
  protected readonly alerts = signal<AccountAlertView[]>([]);
  /** L'alerte en cours d'acquittement — une seule à la fois, pas la page. */
  protected readonly acknowledging = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** Le type en cours d'écriture : une règle s'enregistre seule, pas la page. */
  protected readonly saving = signal<AlertKind | null>(null);

  constructor() {
    // Un `input` de route n'est pas lié dans le constructeur ; l'effet attend la
    // liaison et rejoue si l'on passe d'un compte à un autre.
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(companyId: string): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      // Les deux ensemble : l'écran ne sert à rien à moitié — des règles sans
      // journal ne disent pas ce qu'elles ont produit, et l'inverse ne dit pas
      // pourquoi.
      const [rules, alerts] = await Promise.all([
        this.service.list(companyId),
        this.service.listAlerts(companyId),
      ]);
      this.rules.set(rules);
      this.alerts.set(alerts);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async applyOverride(override: AccountAlertOverride): Promise<void> {
    await this.write(
      override.kind,
      () => this.service.saveOverride(this.id(), override),
      {
        off: 'Règle désactivée sur ce compte.',
        custom: 'Règle enregistrée pour ce compte.',
      }[override.mode],
    );
  }

  protected async revert(kind: AlertKind): Promise<void> {
    await this.write(
      kind,
      () => this.service.clearOverride(this.id(), kind),
      'Ce compte suit de nouveau le réglage de la plateforme.',
    );
  }

  private async write(kind: AlertKind, action: () => Promise<void>, done: string): Promise<void> {
    this.saving.set(kind);
    try {
      await action();
      this.rules.set(await this.service.list(this.id()));
      this.notify.success(done);
    } catch (error) {
      this.notify.error(error, "La dérogation n'a pas pu être enregistrée.");
    } finally {
      this.saving.set(null);
    }
  }

  /**
   * Acquitte, puis **relit** le journal. Le serveur date l'acquittement et retient
   * le premier : recomposer la ligne ici la ferait diverger de ce qui est écrit.
   */
  protected async acknowledge(alertId: string): Promise<void> {
    this.acknowledging.set(alertId);
    try {
      await this.service.acknowledge(alertId);
      this.alerts.set(await this.service.listAlerts(this.id()));
    } catch (error) {
      this.notify.error(error, "L'alerte n'a pas pu être acquittée.");
    } finally {
      this.acknowledging.set(null);
    }
  }
}
