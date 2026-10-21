import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderCutoffView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CutoffWaiversCard } from '../cutoff-waivers-card/cutoff-waivers-card';
import { GRACE_CHOICES } from '../cutoffs-section/cutoff-format';
import { CutoffsSection } from '../cutoffs-section/cutoffs-section';
import { LateFeeSummaryCard } from '../late-fee-summary-card/late-fee-summary-card';

/**
 * **Heure limite de commande** — Réglages › Commandes
 * (`documentation/commandes/plan-reglages-commandes.md` §3.2, lots O1b et O1c).
 *
 * Trois blocs, dans cet ordre : l'heure limite générale, pour tout le monde,
 * qui déclenche l'arrêt du plan de production pour le lendemain (Hugo,
 * 2026-10-21 — `limites-de-commande/plan-une-seule-heure.md` §5), ses
 * dérogations, et le renvoi vers la limite par produit, au référentiel. La
 * carte « Clientèle particulière — à venir » est retirée le même jour : le
 * modèle (schéma des réglages §0) n'a plus de limite par clientèle.
 *
 * Chaque bloc suit son droit : la page s'ouvre sous `lfc_order_settings:read`,
 * les dérogations sous `b2b_order_waivers:read` (la règle et l'exception ne
 * sont pas le même droit), le renvoi sous `pim_catalog:read`. Le renvoi n'est
 * qu'un LIEN : rien de l'échelle du référentiel ne se lit ni ne s'édite d'ici.
 *
 * L'interrupteur de l'heure limite générale est retiré (2026-10-21), et le
 * jour même a sa page (Réglages › Commandes › Jour même).
 *
 * ## La section « Rattrapage » (Hugo, 2026-10-21)
 *
 * Le rattrapage avait trois morceaux dans trois écrans (point 2 de
 * `limites-de-commande/schema-des-reglages.md`) : sa durée, les dérogations
 * qui ne valent que pendant lui, et ce qu'elles coûtent. Ils se lisent ici
 * ensemble, sous l'heure, chacun sous son droit : la durée avec la règle
 * (`lfc_order_settings`), les dérogations sous `b2b_order_waivers`, la
 * surtaxe EN LECTURE sous `b2b_late_fee` — elle se règle en Comptabilité.
 */
@Component({
  selector: 'app-order-cutoffs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CutoffsSection,
    CutoffWaiversCard,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldPageLayoutComponent,
    LateFeeSummaryCard,
    RouterLink,
  ],
  templateUrl: './order-cutoffs-page.html',
  styleUrl: './order-cutoffs-page.scss',
})
export class OrderCutoffsPage {
  private readonly permissions = inject(PermissionsStore);

  protected readonly seesWaivers = computed(() => this.permissions.can('b2b_order_waivers:read'));
  protected readonly seesCatalogue = computed(() => this.permissions.can('pim_catalog:read'));

  /** La règle générale telle que la section de l'heure l'a lue ; `undefined` avant. */
  protected readonly general = signal<OrderCutoffView | null | undefined>(undefined);

  /** La durée du rattrapage en clair, ou `null` tant que l'heure n'est pas lue. */
  protected readonly graceDuration = computed(() => {
    const rule = this.general();
    if (rule === undefined) {
      return null;
    }
    if (rule === null) {
      return "Aucun — l'heure limite générale n'est pas posée.";
    }
    const choice = GRACE_CHOICES.find((option) => option.value === rule.graceMinutes);
    return choice?.label ?? `${rule.graceMinutes} minutes`;
  });
}
