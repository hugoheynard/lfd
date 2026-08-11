import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';
import type {
  AccountAlertOverride,
  AccountAlertRuleView,
  AlertRule,
  AlertRuleView,
} from '@lfd/contracts';

import { ALERT_KIND_LABELS } from '../../../shared/alerts/alert-kind-labels';
import { AlertRuleRow } from '../../../shared/alerts/alert-rule-row/alert-rule-row';
import { describeRule } from '../../../shared/alerts/describe-rule';

/** L'état d'une règle sur ce compte, tel que l'écran doit le dire. */
type AccountRuleState = 'inherited' | 'off' | 'custom';

/**
 * **Une règle d'alerte vue depuis un compte** : ce que dit la plateforme, ce que
 * ce compte en fait, et de quoi le changer.
 *
 * La règle globale est **toujours rappelée**, y compris — surtout — quand le
 * compte y déroge : sans elle on lirait « ce compte déroge » sans savoir à quoi,
 * et une dérogation silencieuse est un piège pour le prochain commercial qui
 * s'étonnera de ne pas voir passer d'alerte.
 *
 * L'édition rouvre l'éditeur **partagé** avec l'écran de réglages : mêmes champs,
 * mêmes bornes, même échelle de paliers. Un second formulaire aurait fini par
 * accepter ce que l'autre refuse.
 */
@Component({
  selector: 'app-account-alert-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldButtonComponent, AlertRuleRow],
  templateUrl: './account-alert-card.html',
  styleUrl: './account-alert-card.scss',
})
export class AccountAlertCard {
  readonly rule = input.required<AccountAlertRuleView>();
  readonly busy = input(false);

  readonly override = output<AccountAlertOverride>();
  readonly revert = output<void>();

  protected readonly editing = signal(false);

  protected readonly labels = computed(() => ALERT_KIND_LABELS[this.rule().kind]);
  protected readonly globalLines = computed(() => describeRule(this.rule().global));

  /**
   * Le réglage propre au compte, résumé **comme celui de la plateforme** — même
   * format, même vocabulaire, l'un sous l'autre.
   *
   * Sans ça, lire ce qu'un compte dérogé applique réellement obligeait à ouvrir
   * l'éditeur, c'est-à-dire à entrer en mode modification pour une simple
   * lecture. Deux résumés comparables se lisent d'un coup d'œil ; deux formats
   * différents ne se comparent pas.
   *
   * `null` en mode `off` : l'effectif y est le global éteint, donc le même texte
   * — l'afficher deux fois n'apprendrait rien, la ligne d'état le dit déjà.
   */
  protected readonly accountLines = computed<string[] | null>(() => {
    const view = this.rule();
    return view.override?.mode === 'custom' ? describeRule(view.effective) : null;
  });

  protected readonly state = computed<AccountRuleState>(() => {
    const override = this.rule().override;
    return override === null ? 'inherited' : override.mode;
  });

  /**
   * Ce que l'éditeur ouvre : **l'effectif**, pas le global. Modifier une règle
   * déjà dérogée doit repartir de ce que le compte applique, sinon le premier
   * clic écraserait silencieusement le réglage propre au compte.
   */
  protected readonly editable = computed<AlertRuleView>(() => {
    const view = this.rule();
    return { kind: view.kind, ...view.effective, updatedAt: null };
  });

  protected startEditing(): void {
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.editing.set(false);
  }

  /** Désactiver ne fige pas les paramètres : c'est un `off`, pas une copie éteinte. */
  protected disableHere(): void {
    this.override.emit({ kind: this.rule().kind, mode: 'off' });
  }

  protected saveHere(rule: AlertRule): void {
    this.editing.set(false);
    this.override.emit({ kind: this.rule().kind, mode: 'custom', rule });
  }

  protected revertToGlobal(): void {
    this.editing.set(false);
    this.revert.emit();
  }
}
