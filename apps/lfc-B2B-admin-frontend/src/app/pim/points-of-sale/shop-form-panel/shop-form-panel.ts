import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import type { PointOfSaleView } from '@lfd/pim-contracts';

import { SalesContextStore } from '../../catalogue/sales-contexts/sales-context-store';
import { PointOfSaleStore } from '../point-of-sale-store';

/** Ce qu'on fait d'une boutique existante depuis le panneau. */
export type ShopPanelMode = 'edit' | 'delete';

/** Charge passée à `open()` : la boutique visée et l'intention. Absente = création. */
export interface ShopPanelData {
  readonly mode: ShopPanelMode;
  readonly shop: PointOfSaleView;
}

/**
 * Panneau **boutique** : création, édition ou suppression, ouvert
 * impérativement via `FoldPanelHostService.open()`. Sans `data` il crée ; avec
 * `{ mode: 'edit', shop }` il édite (champs préremplis) ; avec
 * `{ mode: 'delete', shop }` il affiche une **zone dangereuse** — confirmation
 * en retapant le nom, car supprimer la boutique emporte ses tables et rend
 * caducs les QR déjà imprimés.
 *
 * Les **modes de vente** ont disparu : ce n'étaient pas des cases à cocher mais
 * les contextes que la boutique OFFRE, et le registre décide de ceux qui
 * existent. En ajouter un ne demande plus de livrer ce panneau.
 */
@Component({
  selector: 'app-shop-form-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
  ],
  templateUrl: './shop-form-panel.html',
  styleUrl: './shop-form-panel.scss',
})
export class ShopFormPanel {
  private readonly store = inject(PointOfSaleStore);
  private readonly contexts = inject(SalesContextStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  /** Boutique + intention ; absent = création. */
  readonly data = input<ShopPanelData | undefined>(undefined);

  protected readonly shop = computed(() => this.data()?.shop);

  /** Les contextes proposables — ceux du registre, en service. */
  protected readonly offerable = computed(() => this.contexts.items());

  /**
   * Les brouillons **dérivent** de la boutique reçue.
   *
   * `linkedSignal` plutôt qu'un `effect` d'amorçage : l'effet re-tirait à chaque
   * changement de l'entrée et **écrasait la saisie en cours**, et il laissait
   * une fenêtre où les champs étaient vides — assez pour qu'un enregistrement
   * précoce parte avec un nom vide. Même correction que sur le panneau famille.
   */
  protected readonly draftName = linkedSignal(() => this.shop()?.label ?? '');
  protected readonly draftBaseUrl = linkedSignal(() => this.shop()?.baseUrl ?? '');
  protected readonly draftContexts = linkedSignal<readonly string[]>(
    () => this.shop()?.contexts ?? [],
  );
  protected readonly draftTables = linkedSignal<number | null>(
    () => this.shop()?.tables.length ?? 0,
  );
  /** Saisie de confirmation en mode suppression (doit égaler le nom de la boutique). */
  protected readonly confirmName = signal('');
  protected readonly busy = signal(false);
  protected readonly isEdit = computed(() => this.data()?.mode === 'edit');
  protected readonly isDelete = computed(() => this.data()?.mode === 'delete');

  protected readonly heading = computed(() =>
    this.isDelete()
      ? 'Supprimer la boutique'
      : this.isEdit()
        ? 'Modifier la boutique'
        : 'Nouvelle boutique',
  );
  protected readonly subtitle = computed(() =>
    this.isDelete() ? 'Action irréversible.' : "Une boutique, ce qu'elle offre et ses tables.",
  );
  protected readonly submitLabel = computed(() =>
    this.isDelete()
      ? 'Supprimer définitivement'
      : this.isEdit()
        ? 'Enregistrer'
        : 'Ajouter la boutique',
  );

  /** En suppression, le nom retapé doit correspondre exactement. */
  protected readonly confirmMatches = computed(() => {
    const target = this.shop();
    return target !== undefined && this.confirmName().trim() === target.label;
  });

  protected offers(contextKey: string): boolean {
    return this.draftContexts().includes(contextKey);
  }

  /**
   * Coche ou décoche un contexte offert.
   *
   * Décocher ne touche PAS aux tables — c'est le changement de p-3 : une grille
   * de QR est de l'équipement, pas un mode de vente, et détruire du papier collé
   * sur un meuble pour une case décochée était disproportionné.
   */
  protected setOffer(contextKey: string, offered: boolean): void {
    const without = this.draftContexts().filter((key) => key !== contextKey);
    this.draftContexts.set(offered ? [...without, contextKey] : without);
  }

  /** Combien de familles vendent ici — le référentiel refusera tant que > 0. */
  protected readonly usedByCategories = computed(() => this.shop()?.usedByCategories ?? 0);

  /**
   * Supprimable : **personne ne s'en sert**, et le nom est confirmé.
   *
   * Le compte vient de l'API. Sans lui, le bouton était armé quoi qu'il arrive
   * et le refus n'arrivait qu'après le clic — alors que le panneau des taux, à
   * deux dossiers d'ici, désarme le sien pour exactement cette raison.
   */
  protected readonly canDelete = computed(
    () => this.usedByCategories() === 0 && this.confirmMatches(),
  );

  protected get canSubmit(): boolean {
    if (this.isDelete()) {
      return this.canDelete();
    }
    return this.draftName().trim() !== '';
  }

  /**
   * Le panneau **reste ouvert** sur un refus, et le message est celui du
   * référentiel — « Point de vente encore vendeur : 3 famille(s) le citent » —
   * et non le `message` brut d'une `HttpErrorResponse`, qui aurait affiché
   * « Http failure response for http://… : 409 Conflict ». Le backend prend
   * soin de dire quoi faire ; l'écran le lui reprenait.
   */
  protected async submit(): Promise<void> {
    this.busy.set(true);
    try {
      await this.persist();
      this.ref.close(true);
    } catch (caught) {
      this.notify.refused(caught, 'Opération refusée.');
    } finally {
      this.busy.set(false);
    }
  }

  private async persist(): Promise<void> {
    const target = this.shop();
    if (this.isDelete() && target !== undefined) {
      await this.store.remove(target.id);
      return;
    }
    const name = this.draftName().trim();
    if (name === '') {
      // Le bouton est désarmé sur un nom vide ; si on arrive quand même ici,
      // se taire et fermer serait annoncer un enregistrement qui n'a pas eu
      // lieu. On refuse, et le va-et-vient ci-dessus le dit.
      throw new Error('Le nom est obligatoire.');
    }
    const payload = {
      label: name,
      baseUrl: this.draftBaseUrl(),
      contexts: this.draftContexts(),
      tableCount: this.draftTables() ?? 0,
    };
    if (target !== undefined) {
      await this.store.update(target.id, payload);
    } else {
      await this.store.openShop(payload);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
