import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

/**
 * **Un prix et d'où il vient.**
 *
 * Le composant central du paramétrage : il montre le tarif d'origine (celui du
 * PIM) et, s'il existe, celui décidé ici. Un écran qui n'afficherait que le prix
 * final ne permettrait ni de dire « celui-là, c'est nous qui l'avons posé », ni
 * de revenir en arrière — et un prix sans provenance ne se défend pas devant un
 * client qui le conteste.
 *
 * **Purement présentationnel** : il ne sait ni charger, ni écrire, ni lequel des
 * deux hôtes l'affiche. Aucun `isAdmin` ici, jamais.
 */
@Component({
  selector: "lfd-price-origin",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="price">
      <span class="effective" [class.altered]="isAltered()">{{ effective() }}</span>
      @if (isAltered()) {
        <span class="origin" [attr.title]="originTitle()">{{ origin() }}</span>
      }
    </span>
  `,
  styles: `
    .price {
      display: inline-flex;
      align-items: baseline;
      gap: var(--fold-space-2, 0.5rem);
      font-variant-numeric: tabular-nums;
    }
    .effective {
      font-weight: 600;
    }
    /* Un prix décidé ici se voit : sans marque, l'écran laisse croire que tout
       vient du PIM, et personne ne sait plus ce qu'il a négocié. */
    .altered {
      color: var(--fold-color-accent-fg, currentColor);
    }
    .origin {
      color: var(--fold-color-fg-muted, #6b7280);
      font-size: 0.875em;
      text-decoration: line-through;
    }
  `,
})
export class PriceOrigin {
  /** Le tarif de référence, en centimes. Toujours présent. */
  readonly originCents = input.required<number>();
  /** Le tarif décidé localement, en centimes. `null` = on suit l'origine. */
  readonly alteredCents = input<number | null>(null);

  protected readonly isAltered = computed(() => this.alteredCents() !== null);

  protected readonly effective = computed(() =>
    formatEuros(this.alteredCents() ?? this.originCents()),
  );

  protected readonly origin = computed(() => formatEuros(this.originCents()));

  protected readonly originTitle = computed(() => `Tarif d'origine : ${this.origin()}`);
}

/**
 * Centimes → euros, en français.
 *
 * Le formatage vit **ici** et pas dans un pipe partagé : c'est la seule règle du
 * paquet qui touche à l'argent, et deux écrans qui l'écriraient différemment
 * afficheraient deux prix pour la même valeur.
 */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
