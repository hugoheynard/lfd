import { ChangeDetectionStrategy, Component, input } from "@angular/core";

import { PriceOrigin } from "../price-origin/price-origin";

/**
 * Une **ligne d'article** dans un écran de paramétrage.
 *
 * Ce que les deux hôtes ont réellement en commun : un article se lit par son
 * nom, sa référence, sa famille et son prix — et se pilote par une bascule à
 * droite. Le PIM y met « publié sur B2B », le back-office « visible dans la
 * boutique ». Le composant ne sait pas laquelle : il reçoit un libellé et rend
 * l'événement.
 *
 * C'est la frontière qui fait tenir le partage. Dès qu'un composant partagé
 * commence à savoir QUI l'affiche, il cesse d'être partagé et devient deux
 * composants qui se ressemblent.
 */
@Component({
  selector: "lfd-catalog-row",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PriceOrigin],
  template: `
    <div class="row" [class.muted]="dimmed()">
      <div class="identity">
        <span class="name">{{ name() }}</span>
        <span class="sku">{{ sku() }}</span>
      </div>
      <span class="category">{{ category() }}</span>
      <lfd-price-origin [originCents]="originCents()" [alteredCents]="alteredCents()" />
      <div class="trailing">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .row {
      display: grid;
      grid-template-columns: minmax(12rem, 2fr) minmax(8rem, 1fr) auto auto;
      align-items: center;
      gap: var(--fold-space-lg, 1rem);
      padding: var(--fold-space-md, 0.75rem) 0;
      border-block-end: 1px solid var(--fold-color-border, #e5e7eb);
    }
    /* Un article retiré de la vente reste LISIBLE, seulement en retrait : le
       masquer d'un écran de paramétrage empêcherait de le rouvrir. */
    .muted {
      opacity: 0.55;
    }
    .identity {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    .sku,
    .category {
      color: var(--fold-color-text-muted, #6b7280);
      font-size: 0.875rem;
    }
    .trailing {
      display: flex;
      align-items: center;
      gap: var(--fold-space-sm, 0.5rem);
      justify-content: end;
    }
    @media (max-width: 48rem) {
      .row {
        grid-template-columns: 1fr auto;
      }
      .category {
        display: none;
      }
    }
  `,
})
export class CatalogRow {
  readonly sku = input.required<string>();
  readonly name = input.required<string>();
  readonly category = input<string>("");
  readonly originCents = input.required<number>();
  readonly alteredCents = input<number | null>(null);
  /** Mis en retrait — un article retiré de la vente, ou non publié. */
  readonly dimmed = input<boolean>(false);
}
