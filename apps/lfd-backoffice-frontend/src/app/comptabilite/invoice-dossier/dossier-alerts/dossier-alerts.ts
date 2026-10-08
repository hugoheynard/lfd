import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { InvoiceDossierView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

import {
  countOrders,
  day,
  hasAlerts,
  legacyDeliveryOrders,
  monthOfDay,
  signedEuros,
} from '../../invoice-dossier-format';

/**
 * **Les signalements, en tête** — ce qu'un comptable doit voir avant de lire
 * un seul chiffre (plan, § 3.3, § 3.6, § 5) : bons jamais retirés, bons
 * incohérents, bons d'un autre mois de livraison ou sans date, et l'invariant
 * des trois écarts quand il ne tient plus. Rien à signaler se dit aussi.
 *
 * Et d'abord, depuis E0 (`plan-emission-de-la-facture.md`) : ce qui
 * empêcherait d'émettre la facture — vendeur, mentions, payeur.
 */
@Component({
  selector: 'app-dossier-alerts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './dossier-alerts.html',
  styleUrl: './dossier-alerts.scss',
})
export class DossierAlerts {
  readonly dossier = input.required<InvoiceDossierView>();

  protected readonly any = computed(() => hasAlerts(this.dossier()));
  protected readonly legacyDelivery = computed(() => legacyDeliveryOrders(this.dossier()));

  protected readonly count = countOrders;
  protected readonly day = day;
  protected readonly monthOfDay = monthOfDay;
  protected readonly signed = signedEuros;
}
