import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { InvoiceDossierView } from '@lfd/contracts';
import { FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import { euros, nonZero, ratePercent, signedEuros } from '../../invoice-dossier-format';

/**
 * **Les écarts** entre la facture et la somme des bons (plan, § 3.4, § 3.6),
 * chacun avec sa formule : arrondi de la TVA, TVA non ventilée, bon
 * incohérent. Leur somme est total facture − Σ des bons, au centime — l'écran
 * l'écrit, il ne la recalcule pas. Plus d'arrondi des lignes depuis F6
 * (2026-10-08) : le montant d'une ligne est repris des bons, l'écart est nul
 * par construction.
 */
@Component({
  selector: 'app-dossier-gaps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './dossier-gaps.html',
  styleUrl: './dossier-gaps.scss',
})
export class DossierGaps {
  readonly dossier = input.required<InvoiceDossierView>();

  protected readonly vatGaps = computed(() => nonZero(this.dossier().gaps.vatRounding));

  protected readonly euros = euros;
  protected readonly signed = signedEuros;
  protected readonly rate = ratePercent;
}
