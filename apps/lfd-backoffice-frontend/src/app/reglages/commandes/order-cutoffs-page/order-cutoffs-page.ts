import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CutoffWaiversCard } from '../cutoff-waivers-card/cutoff-waivers-card';
import { CutoffsSection } from '../cutoffs-section/cutoffs-section';

/**
 * **Heure limite de commande** — Réglages › Commandes
 * (`documentation/commandes/plan-reglages-commandes.md` §3.2, lots O1b et O1c).
 *
 * Trois blocs, dans cet ordre : la clientèle professionnelle (la limite
 * générale du commerce, puis ses dérogations), la clientèle particulière « à
 * venir », et le renvoi vers la limite de fabrication par article, qui reste
 * au référentiel.
 *
 * Chaque bloc suit son droit : la page s'ouvre sous `lfc_order_settings:read`,
 * les dérogations sous `b2b_order_waivers:read` (la règle et l'exception ne
 * sont pas le même droit), le renvoi sous `pim_catalog:read`. Le renvoi n'est
 * qu'un LIEN : rien de l'échelle du référentiel ne se lit ni ne s'édite d'ici.
 */
@Component({
  selector: 'app-order-cutoffs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CutoffsSection,
    CutoffWaiversCard,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './order-cutoffs-page.html',
  styleUrl: './order-cutoffs-page.scss',
})
export class OrderCutoffsPage {
  private readonly permissions = inject(PermissionsStore);

  protected readonly seesWaivers = computed(() => this.permissions.can('b2b_order_waivers:read'));
  protected readonly seesCatalogue = computed(() => this.permissions.can('pim_catalog:read'));
}
