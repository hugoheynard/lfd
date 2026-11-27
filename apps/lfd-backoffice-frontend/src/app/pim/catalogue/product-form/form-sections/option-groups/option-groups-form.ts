import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { ProductOptionGroupView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../../../auth/permissions.store';
import { NotifyService } from '../../../../../notify.service';
import type { Variant } from '../../../../data/models';
import { OptionGroupStore } from '../../../../product-options/option-group.store';
import { ProductOptionGroupsHttpApi } from '../../../product-option-groups-http-api';
import { ProductFormStore } from '../../product-form-store';
import { variantTabLabel } from '../../variant-label';

/**
 * **Les options de commande de la fiche** (`plan-options-de-commande.md`,
 * § 3.1). Elle liste les groupes activés, en active un — pour toutes les
 * déclinaisons, celles qui viendront comprises, ou une sélection, qu'elles se
 * vendent à la pièce ou au poids — et en retire un.
 *
 * Elle écrit **immédiatement**, sur ses propres routes, comme la vente en
 * opération : l'activation n'appartient à aucune section. Choisir un groupe
 * déjà activé reprend sa sélection, et « Enregistrer » la repose. Une fiche
 * archivée se lit sans geste : le référentiel refuserait.
 */
@Component({
  selector: 'app-option-groups-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCheckboxComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
  ],
  templateUrl: './option-groups-form.html',
  styleUrl: './option-groups-form.scss',
})
export class OptionGroupsForm {
  private readonly api = inject(ProductOptionGroupsHttpApi);
  private readonly groups = inject(OptionGroupStore);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  protected readonly store = inject(ProductFormStore);

  protected readonly activations = signal<readonly ProductOptionGroupView[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** Le groupe choisi dans le sélecteur, et la sélection qu'on lui pose. */
  protected readonly selectedGroupId = signal<string | null>(null);
  protected readonly allVariants = signal(true);
  protected readonly pickedVariantIds = signal<ReadonlySet<string>>(new Set());

  protected readonly canEdit = computed(
    () => this.permissions.can('pim_catalog:write') && this.store.status() !== 'archived',
  );

  /** Les groupes en service, à activer — un groupe déjà activé se reprend. */
  protected readonly groupOptions = computed<readonly FoldSelectOption<string>[]>(() =>
    this.groups.items().map((group) => ({ value: group.id, label: group.name })),
  );

  protected readonly selectedActivation = computed(() =>
    this.activations().find((activation) => activation.groupId === this.selectedGroupId()),
  );

  protected readonly canSubmit = computed(
    () =>
      this.selectedGroupId() !== null &&
      (this.allVariants() || this.pickedVariantIds().size > 0) &&
      !this.busy(),
  );

  constructor() {
    effect(() => {
      const productId = this.store.productId();
      if (productId !== '') {
        void this.reload(productId);
      }
    });
  }

  /** « Toutes les déclinaisons », ou les libellés de la sélection. */
  protected scopeLabel(activation: ProductOptionGroupView): string {
    if (activation.variantIds === null) {
      return 'Toutes les déclinaisons';
    }
    const variants = this.store.variants();
    return activation.variantIds
      .map((id) => variants.find((variant) => variant.id === id))
      .filter((variant): variant is Variant => variant !== undefined)
      .map((variant) => variantTabLabel(variant))
      .join(', ');
  }

  protected variantLabel(variant: Variant): string {
    return variantTabLabel(variant);
  }

  protected isPicked(variantId: string): boolean {
    return this.pickedVariantIds().has(variantId);
  }

  protected selectGroup(groupId: string | null): void {
    this.selectedGroupId.set(groupId);
    const known = this.activations().find((activation) => activation.groupId === groupId);
    this.allVariants.set(known === undefined || known.variantIds === null);
    this.pickedVariantIds.set(new Set(known?.variantIds ?? []));
  }

  protected togglePick(variantId: string, picked: boolean): void {
    this.pickedVariantIds.update((current) => {
      const next = new Set(current);
      if (picked) {
        next.add(variantId);
      } else {
        next.delete(variantId);
      }
      return next;
    });
  }

  protected async activate(): Promise<void> {
    const groupId = this.selectedGroupId();
    if (groupId === null || !this.canSubmit()) {
      return;
    }
    const variantIds = this.allVariants()
      ? null
      : this.store
          .variants()
          .map((variant) => variant.id)
          .filter((id) => this.pickedVariantIds().has(id));
    await this.write(
      () => this.api.activate(this.store.productId(), groupId, variantIds),
      'Options de commande enregistrées.',
    );
    this.selectGroup(null);
  }

  protected async deactivate(groupId: string): Promise<void> {
    await this.write(
      () => this.api.deactivate(this.store.productId(), groupId),
      'Groupe retiré de la fiche.',
    );
    if (this.selectedGroupId() === groupId) {
      this.selectGroup(null);
    }
  }

  private async write(action: () => Promise<void>, success: string): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.notify.success(success);
      await this.reload(this.store.productId());
    } catch (caught) {
      this.notify.refused(caught, "Le réglage n'a pas pu être enregistré.");
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(productId: string): Promise<void> {
    try {
      this.activations.set(await this.api.list(productId));
      this.loadError.set(null);
    } catch {
      this.loadError.set('Les options de commande de la fiche n’ont pas pu être lues.');
    }
  }
}
