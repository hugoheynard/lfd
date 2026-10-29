import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldButtonComponent,
  FoldDangerZoneComponent,
  FoldDisclosureComponent,
  FoldInlineConfirmComponent,
  FoldLinkComponent,
} from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/**
 * **Ce qui sort une déclinaison de sa fiche, ou l'y ramène**
 * (`plan-gestes-de-declinaison.md`, G1 et G2) — la carte « Déclinaisons » de
 * l'onglet « Danger » (demande de Hugo, 2026-10-29). Ces gestes vivaient sous
 * la barre des déclinaisons ; ce qui n'en retire rien y est resté
 * (`VariantLifecycle` : la filiation, « en faire le défaut »).
 *
 * Deux morceaux, lus du magasin :
 * - pour la déclinaison OUVERTE, si elle n'est pas le défaut : l'archiver, ou
 *   en faire un produit ;
 * - les archivées, repliées, chacune avec « Désarchiver » ou le produit
 *   qu'elle est devenue.
 *
 * La carte se tait quand elle n'a rien à offrir (défaut ouvert, aucune
 * archivée) : la page la monte sans condition.
 */
@Component({
  selector: 'app-variant-retirement',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldDangerZoneComponent,
    FoldDisclosureComponent,
    FoldInlineConfirmComponent,
    FoldLinkComponent,
  ],
  templateUrl: './variant-retirement.html',
  styleUrl: './variant-retirement.scss',
})
export class VariantRetirement {
  protected readonly store = inject(ProductFormStore);
  private readonly router = inject(Router);

  /** L'onglet ouvert, s'il n'est pas le défaut — le seul qu'on peut sortir. */
  protected readonly retirable = computed(
    () => this.store.variantTabs().find((tab) => tab.selected && !tab.isDefault) ?? null,
  );

  /** Vrai s'il y a un geste ou une archivée à montrer. */
  protected readonly shown = computed(
    () => this.retirable() !== null || this.store.archivedVariants().length > 0,
  );

  protected discontinue(variantId: string): void {
    void this.store.discontinueVariant(variantId);
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
