import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublishedCellState } from '@lfd/contracts';
import { FoldBadgeComponent, FoldButtonComponent, FoldInlineConfirmComponent } from 'fold-ng';

import type { ShopAudience } from '../catalogue.service';
import { gapLabel } from '../published-catalogue';

/** Les mots d'une audience, au datif et au nominatif. */
const TO: Readonly<Record<ShopAudience, string>> = { pro: 'aux pros', public: 'au public' };
const SHOP: Readonly<Record<ShopAudience, string>> = {
  pro: 'la boutique PROFESSIONNELLE',
  public: 'la boutique PUBLIQUE',
};
const OTHER: Readonly<Record<ShopAudience, string>> = {
  pro: 'La boutique publique',
  public: 'La boutique professionnelle',
};

/**
 * **Une cellule d'audience** de la vue « Catalogue publié » — ce que les pros,
 * ou le public, voient de cette déclinaison.
 *
 * Six états, et **un seul geste** (D7) : l'interrupteur masquer / afficher,
 * offert sur `en_vente` et `masque` seulement. Tout autre état est une lecture
 * — le serveur refuserait de masquer hors de l'audience, et « pas vendu » se
 * change au référentiel, d'où le lien vers la fiche.
 *
 * Le geste se confirme DANS la cellule, comme avant : masquer coupe la
 * commande, afficher la rouvre, et les deux se voient depuis une boutique.
 */
@Component({
  selector: 'app-published-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldInlineConfirmComponent, RouterLink],
  templateUrl: './published-cell.html',
  styleUrl: './published-cell.scss',
})
export class PublishedCell {
  readonly audience = input.required<ShopAudience>();
  readonly state = input.required<PublishedCellState>();
  /** Le prix servi ou proposé, déjà formaté avec son unité ; `null` = aucun. */
  readonly price = input<string | null>(null);
  /** Ce qui manque à la déclinaison (codes du référentiel). */
  readonly gaps = input<readonly string[]>([]);
  readonly productId = input.required<string>();
  /** Le nom de l'article, pour nommer le geste à l'oreille. */
  readonly name = input.required<string>();

  /** Masquer (depuis `en_vente`) ou afficher (depuis `masque`) — le parent lit l'état. */
  readonly maskToggled = output<void>();

  protected readonly to = computed(() => TO[this.audience()]);

  /** Ce qui manque, en mots — ou, sans manque déclaré, ce que l'audience n'a pas. */
  protected readonly missing = computed(() => {
    const gaps = this.gaps();
    return gaps.length > 0
      ? gaps.map(gapLabel).join(', ')
      : `pas de prix ou de taux ${this.audience() === 'pro' ? 'pro' : 'public'}`;
  });

  protected readonly hidden = computed(() => this.state() === 'masque');

  protected readonly confirmMessage = computed(() => {
    const shop = SHOP[this.audience()];
    const other = OTHER[this.audience()];
    return this.hidden()
      ? `L’article revient dans ${shop}. ${other} n’est pas touchée.`
      : `L’article disparaît de ${shop}. ${other} n’est pas touchée.`;
  });

  protected readonly toggleLabel = computed(
    () => `${this.hidden() ? 'Afficher' : 'Masquer'} ${this.name()} ${this.to()}`,
  );
}
