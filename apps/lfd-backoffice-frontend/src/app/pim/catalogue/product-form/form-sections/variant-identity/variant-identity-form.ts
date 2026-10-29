import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SOURCE_LOCALE } from '@lfd/pim-contracts';
import { FoldButtonComponent, FoldInputComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { localizedField } from '../../../../../shared/lang-switch/localized-field';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

/**
 * **Identité de la déclinaison** — son nom de BOUTIQUE et ses langues
 * (`documentation/catalogue/plan-identite-de-declinaison.md`, I1, § 3).
 *
 * Une carte à part, et non un champ de la carte Identité : celle-ci appartient
 * à la fiche, se verrouille hors du défaut et part avec « Tout enregistrer ».
 * Celle-ci est ouverte sur TOUTE déclinaison et s'enregistre seule, tout de
 * suite, comme l'audience.
 *
 * L'onglet ne bouge pas quand on enregistre : il lit le libellé interne, que le
 * serveur fige au premier écart.
 */
@Component({
  selector: 'app-variant-identity-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldInputComponent, LangSwitch],
  templateUrl: './variant-identity-form.html',
  styleUrls: ['../form-section.scss'],
})
export class VariantIdentityForm {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(ProductFormStore);

  protected readonly busy = signal(false);
  protected readonly sourceLocale = SOURCE_LOCALE;

  private readonly variant = computed(() =>
    this.store.variants().find((entry) => entry.id === this.store.selectedVariantId()),
  );

  /** Le nom de boutique lu sur la déclinaison ouverte — relu à chaque bascule d'onglet. */
  private readonly savedName = computed(() => this.variant()?.name ?? { fr: '' });

  protected readonly name = localizedField({
    source: () => this.savedName(),
    label: 'Nom en boutique',
    subject: 'Le nom en boutique manque',
  });

  /**
   * Ce que ce nom engage. L'atelier et le colisage lisent le nom figé sur la
   * ligne de commande : le changer vaut pour les commandes SUIVANTES (§ 3). Le
   * défaut naît du nom de la fiche et en prend les traductions tant qu'il le
   * porte (`variantNameTranslationsOf`).
   */
  protected readonly hint = computed(() => {
    const base =
      'Le nom affiché en boutique, au devis et sur la facture. L’atelier et le colisage le ' +
      'lisent pour les commandes suivantes.';
    return this.variant()?.isDefault === true
      ? `${base} Tant que ce nom est celui de la fiche, il en prend les traductions.`
      : base;
  });

  protected readonly changed = computed(
    () => JSON.stringify(this.name.text()) !== JSON.stringify(this.savedName()),
  );

  protected async save(): Promise<void> {
    const variant = this.variant();
    if (variant === undefined || !this.changed() || !this.name.filled()) {
      return;
    }
    const name = this.name.text();
    this.busy.set(true);
    try {
      await this.products.setVariantShopName(this.store.productId(), variant.id, name);
      this.store.acceptVariantShopName(variant.id, name);
      this.notify.success('Le nom en boutique est enregistré.');
    } catch (caught) {
      this.notify.error(caught, "Le nom en boutique n'a pas pu être enregistré.");
    } finally {
      this.busy.set(false);
    }
  }
}
