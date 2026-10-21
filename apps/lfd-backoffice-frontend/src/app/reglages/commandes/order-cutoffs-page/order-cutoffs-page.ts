import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
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
