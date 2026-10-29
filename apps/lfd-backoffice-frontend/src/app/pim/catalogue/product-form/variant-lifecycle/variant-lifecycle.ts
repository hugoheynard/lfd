import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDangerZoneComponent,
  FoldDisclosureComponent,
  FoldInlineConfirmComponent,
  FoldLinkComponent,
} from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/**
 * **Ce qui sort une déclinaison de sa fiche, ou l'y ramène**
 * (`plan-gestes-de-declinaison.md`, G1 et G2), sous la barre des déclinaisons.
 *
 * Trois morceaux, tous lus du magasin :
 * - d'où vient la fiche, si elle est née d'un détachement ;
 * - pour la déclinaison OUVERTE, si elle n'est pas le défaut : « en faire la
 *   déclinaison par défaut » (G4), HORS de la zone de danger — le geste ne
 *   retire rien et se défait par le même geste sur l'autre onglet ; puis la
 *   zone de danger : archiver, ou en faire un produit ;
 * - les archivées, repliées, chacune avec « Désarchiver » ou le produit
 *   qu'elle est devenue.
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
    FoldDangerZoneComponent,
    FoldDisclosureComponent,
    FoldInlineConfirmComponent,
    FoldLinkComponent,
  ],
  templateUrl: './variant-lifecycle.html',
  styleUrl: './variant-lifecycle.scss',
})
export class VariantLifecycle {
  protected readonly store = inject(ProductFormStore);
  private readonly router = inject(Router);

  /** L'onglet ouvert, s'il n'est pas le défaut — le seul qu'on peut sortir. */
  protected readonly retirable = computed(
    () => this.store.variantTabs().find((tab) => tab.selected && !tab.isDefault) ?? null,
  );

  protected discontinue(variantId: string): void {
    void this.store.discontinueVariant(variantId);
  }

  protected makeDefault(variantId: string): void {
    void this.store.makeVariantDefault(variantId);
  }

  protected restore(variantId: string): void {
    void this.store.restoreVariant(variantId);
  }

  /** Après succès, la nouvelle fiche s'ouvre : c'est là qu'on la relit avant de l'activer. */
  protected async detach(variantId: string): Promise<void> {
    const born = await this.store.detachVariant(variantId);
    if (born !== null) {
      await this.router.navigate(['/pim/produits', born]);
    }
  }

  protected open(productId: string): void {
    void this.router.navigate(['/pim/produits', productId]);
  }
}
