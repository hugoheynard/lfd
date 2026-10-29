import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  FoldLinkComponent,
} from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/**
 * **Ce qui reste sous la barre des déclinaisons** : ce qui n'y retire rien
 * (`plan-gestes-de-declinaison.md`).
 *
 * - d'où vient la fiche, si elle est née d'un détachement ;
 * - pour la déclinaison OUVERTE, si elle n'est pas le défaut : « en faire la
 *   déclinaison par défaut » (G4) — le geste ne retire rien et se défait par
 *   le même geste sur l'autre onglet.
 *
 * Archiver, détacher et désarchiver ont déménagé dans l'onglet « Danger » de
 * la fiche (`VariantRetirement`, demande de Hugo, 2026-10-29).
 *
 * Confirmation en ligne (`fold-inline-confirm`), sans dialogue : ses mots
 * viennent du fournisseur global d'`app.config.ts`, le libellé du bouton de
 * confirmation est posé ici parce qu'il nomme le geste.
 */
@Component({
  selector: 'app-variant-lifecycle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    FoldLinkComponent,
  ],
  templateUrl: './variant-lifecycle.html',
  styleUrl: './variant-lifecycle.scss',
})
export class VariantLifecycle {
  protected readonly store = inject(ProductFormStore);
  private readonly router = inject(Router);

  /** L'onglet ouvert, s'il n'est pas le défaut — le seul qu'on peut promouvoir. */
  protected readonly retirable = computed(
    () => this.store.variantTabs().find((tab) => tab.selected && !tab.isDefault) ?? null,
  );

  protected makeDefault(variantId: string): void {
    void this.store.makeVariantDefault(variantId);
  }

  protected open(productId: string): void {
    void this.router.navigate(['/pim/produits', productId]);
  }
}
