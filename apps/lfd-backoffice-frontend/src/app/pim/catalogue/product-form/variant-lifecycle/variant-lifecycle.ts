import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FoldButtonComponent, FoldCalloutComponent, FoldLinkComponent } from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/** Pourquoi le bouton est désactivé — la même phrase que le refus du serveur. */
export const DEFAULT_CHANGE_SUSPENDED =
  'Le changement de déclinaison par défaut revient après la bascule de la référence du défaut.';

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
 * 🔴 **Le changement de défaut est fermé jusqu'à la bascule de la référence
 * du défaut** (`documentation/catalogue/plan-defaut-sous-sa-reference.md`,
 * § 10, D-b) : le bouton reste visible mais désactivé, et la phrase du refus
 * du serveur est écrite à côté — un bouton grisé sans raison ne dit pas quoi
 * attendre. Le L3 rouvre le geste et sa confirmation en ligne.
 */
@Component({
  selector: 'app-variant-lifecycle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldLinkComponent],
  templateUrl: './variant-lifecycle.html',
  styleUrl: './variant-lifecycle.scss',
})
export class VariantLifecycle {
  /** La phrase du refus du serveur (`DefaultVariantChangeSuspendedError`), mot pour mot. */
  protected readonly suspended = DEFAULT_CHANGE_SUSPENDED;

  protected readonly store = inject(ProductFormStore);
  private readonly router = inject(Router);

  /** L'onglet ouvert, s'il n'est pas le défaut — le seul qu'on peut promouvoir. */
  protected readonly retirable = computed(
    () => this.store.variantTabs().find((tab) => tab.selected && !tab.isDefault) ?? null,
  );

  protected open(productId: string): void {
    void this.router.navigate(['/pim/produits', productId]);
  }
}
