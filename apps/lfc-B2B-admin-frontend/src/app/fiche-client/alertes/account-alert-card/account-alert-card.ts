import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
} from 'fold-ng';
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
  imports: [
    DatePipe,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    AlertRuleRow,
  ],
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

  /**
   * L'état **tel que l'écran doit le dire** — dérivé de ce qui s'applique, pas
   * de la façon dont c'est stocké. Un `custom` éteint et un `off` sont deux
   * représentations de la même chose pour qui lit la fiche : la règle ne tourne
   * pas ici.
   */
  protected readonly state = computed<AccountRuleState>(() => {
    const view = this.rule();
    if (view.override === null) {
      return 'inherited';
    }
    return view.effective.enabled ? 'custom' : 'off';
  });

  /** Ce qui tourne réellement sur ce compte — l'état du bouton. */
  protected readonly enabledHere = computed(() => this.rule().effective.enabled);

  /**
   * La provenance d'une dérogation : quand, et par qui.
   *
   * « Qui a coupé les alertes sur ce compte » est LA question qu'on posera dans
   * six mois. Sans cette ligne, la réponse n'existe nulle part.
   */
  protected readonly overrideOrigin = computed<string | null>(() => {
    const view = this.rule();
    if (view.overrideUpdatedAt === null) {
      return null;
    }
    const when = new Date(view.overrideUpdatedAt).toLocaleDateString('fr-FR');
    return view.overrideUpdatedBy === null
      ? `Posée le ${when}`
      : `Posée le ${when} par ${view.overrideUpdatedBy}`;
  });

  /**
   * Ce que l'éditeur ouvre : **l'effectif**, pas le global. Modifier une règle
   * déjà dérogée doit repartir de ce que le compte applique, sinon le premier
   * clic écraserait silencieusement le réglage propre au compte.
   */
  protected readonly editable = computed<AlertRuleView>(() => {
    const view = this.rule();
    return {
      kind: view.kind,
      ...view.effective,
      // L'éditeur ne montre ni date ni auteur : la carte les porte déjà, et les
      // répéter dans le formulaire laisserait croire qu'ils s'éditent.
      updatedAt: null,
      updatedBy: null,
      degraded: view.degraded,
    };
  });

  protected startEditing(): void {
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.editing.set(false);
  }

  /**
   * Allumer / éteindre la règle **sur ce compte**, quel que soit l'état courant.
   *
   * L'activation et le réglage sont deux axes indépendants : « cette règle
   * tourne-t-elle ici ? » et « avec quels seuils ? ». Les mélanger avait produit
   * un bouton *Désactiver* qui disparaissait dès qu'un compte portait sa propre
   * règle — il fallait alors ouvrir l'éditeur et décocher une case au fond d'un
   * formulaire pour faire ce qu'un interrupteur fait en un clic.
   *
   * On choisit la **plus petite représentation** qui dit la vérité :
   *
   * - un compte qui porte sa règle garde ses seuils, on ne touche qu'à `enabled`
   *   — sinon l'éteindre effacerait un réglage qu'on a pris la peine de faire ;
   * - éteindre sans règle propre, c'est `off` : rien à figer ;
   * - rallumer quand la plateforme est déjà allumée, c'est **revenir au global**
   *   plutôt que d'inscrire une dérogation qui ne déroge de rien ;
   * - rallumer quand la plateforme est éteinte suppose bien une dérogation : le
   *   compte veut cette règle que les autres n'ont pas. Elle part des paramètres
   *   du global, seuls disponibles.
   */
  protected toggleHere(on: boolean): void {
    const view = this.rule();
    const own = view.override?.mode === 'custom' ? view.override.rule : null;

    if (own !== null) {
      this.override.emit({ kind: view.kind, mode: 'custom', rule: { ...own, enabled: on } });
      return;
    }
    if (!on) {
      this.override.emit({ kind: view.kind, mode: 'off' });
      return;
    }
    if (view.global.enabled) {
      this.revert.emit();
      return;
    }
    this.override.emit({
      kind: view.kind,
      mode: 'custom',
      rule: { ...view.global, enabled: true },
    });
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
