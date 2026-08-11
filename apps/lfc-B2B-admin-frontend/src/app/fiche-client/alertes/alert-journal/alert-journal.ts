import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';
import type { AccountAlertView } from '@lfd/contracts';

import { ALERT_KIND_LABELS } from '../../../shared/alerts/alert-kind-labels';

/**
 * Le **journal d'alertes** d'un compte : ce qui s'est réellement déclenché.
 *
 * Les non acquittées d'abord — c'est la seule chose sur laquelle on agit. Le
 * reste sert de mémoire, pas de file d'attente : une liste qui remonte tout dans
 * l'ordre chronologique fait perdre de vue ce qui reste à faire.
 *
 * Une alerte porte **plusieurs constats** (un par ligne de commande concernée) :
 * c'est le cap de bruit, et il se voit ici — quinze nouveaux produits font une
 * carte à quinze lignes, pas quinze cartes.
 */
@Component({
  selector: 'app-alert-journal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldButtonComponent],
  templateUrl: './alert-journal.html',
  styleUrl: './alert-journal.scss',
})
export class AlertJournal {
  readonly alerts = input.required<readonly AccountAlertView[]>();
  readonly busy = input<string | null>(null);
  readonly acknowledge = output<string>();

  protected readonly pending = computed(() =>
    this.alerts().filter((alert) => alert.acknowledgedAt === null),
  );
  protected readonly handled = computed(() =>
    this.alerts().filter((alert) => alert.acknowledgedAt !== null),
  );

  protected title(alert: AccountAlertView): string {
    return ALERT_KIND_LABELS[alert.kind].title;
  }

  protected icon(alert: AccountAlertView): string {
    return ALERT_KIND_LABELS[alert.kind].icon;
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
}
