import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';

import type { PointOfSaleKindView, PointOfSaleView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDangerZoneComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldOptionComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { SalesContextStore } from '../../sales-contexts/sales-context-store';
import { PointOfSaleStore } from '../point-of-sale-store';

/** Charge passée à `open()` : le point de vente à régler. Absente = ouverture. */
export interface PointOfSalePanelData {
  readonly pointOfSale: PointOfSaleView;
}

/**
 * Panneau **point de vente** : ouverture ou réglage, ouvert impérativement via
 * `FoldPanelHostService.open()`.
 *
 * ## Trois choses qui ont changé, et pourquoi
 *
 * **Le genre est un choix, pas deux boutons.** Une plateforme n'est pas un cas
 * d'exception : c'est l'autre valeur de `kind`. Il est **figé après
 * l'ouverture** — il décide de la forme (URL de click & collect, grille de
 * tables), et le basculer laisserait un équipement sans objet.
 *
 * **La suppression est ici, pas dans un menu.** Un menu à deux entrées dont
 * l'une ouvre ce panneau et l'autre le même panneau dans un autre mode était
 * un détour : on supprime ce qu'on est en train de regarder. La zone dangereuse
 * garde la confirmation par le nom, et reste FERMÉE quand le référentiel
 * refusera de toute façon.
 *
 * **L'offre est une liste.** C'étaient deux cases nommées — « Click & collect »
 * et « Sur place » — donc un troisième contexte demandait de livrer ce fichier.
 */
@Component({
  selector: 'app-point-of-sale-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldCheckboxComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDangerZoneComponent,
  ],
  templateUrl: './point-of-sale-panel.html',
  styleUrl: './point-of-sale-panel.scss',
})
export class PointOfSalePanel {
  private readonly store = inject(PointOfSaleStore);
  private readonly contexts = inject(SalesContextStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  /** Le point de vente à régler ; absent = ouverture. */
  readonly data = input<PointOfSalePanelData | undefined>(undefined);

  protected readonly pointOfSale = computed(() => this.data()?.pointOfSale);
  protected readonly isEdit = computed(() => this.pointOfSale() !== undefined);

  /** Les contextes proposables — ceux du registre, en service. */
  protected readonly offerable = computed(() => this.contexts.items());

  /**
   * Les brouillons **dérivent** du point de vente reçu.
   *
   * `linkedSignal` plutôt qu'un `effect` d'amorçage : l'effet re-tirait à chaque
   * changement de l'entrée et **écrasait la saisie en cours**, et il laissait
   * une fenêtre où les champs étaient vides — assez pour qu'un enregistrement
   * précoce parte avec un nom vide.
   */
  protected readonly draftKind = linkedSignal<PointOfSaleKindView>(
    () => this.pointOfSale()?.kind ?? 'shop',
  );
  protected readonly draftLabel = linkedSignal(() => this.pointOfSale()?.label ?? '');
  protected readonly draftBaseUrl = linkedSignal(() => this.pointOfSale()?.baseUrl ?? '');
  protected readonly draftContexts = linkedSignal<readonly string[]>(
    () => this.pointOfSale()?.contexts ?? [],
  );
  protected readonly draftTables = linkedSignal<number | null>(
    () => this.pointOfSale()?.tables.length ?? 0,
  );
  protected readonly busy = signal(false);

  /** Une plateforme n'a ni URL de click & collect ni tables : c'est un site, pas un lieu. */
  protected readonly isShop = computed(() => this.draftKind() === 'shop');

  protected readonly heading = computed(() =>
    this.isEdit() ? 'Modifier le point de vente' : 'Nouveau point de vente',
  );
  protected readonly subtitle = computed(() =>
    this.isShop()
      ? "Une boutique, ce qu'elle offre et ses tables."
      : 'Une plateforme de commande — ni adresse ni tables.',
  );
  protected readonly submitLabel = computed(() =>
    this.isEdit() ? 'Enregistrer' : 'Ouvrir le point de vente',
  );

  /** Combien de familles vendent ici — le référentiel refusera tant que > 0. */
  protected readonly usedByCategories = computed(() => this.pointOfSale()?.usedByCategories ?? 0);

  /** La plateforme racine ne se supprime pas — la vue le porte, l'écran le dit. */
  protected readonly isRoot = computed(() => this.pointOfSale()?.root === true);

  /**
   * Le libellé d'action de la zone dangereuse, ou `undefined`.
   *
   * `undefined` laisse un cadre qui EXPLIQUE sans rien offrir. Deux raisons de
   * ne rien offrir, et l'écran les distingue : le référentiel refuse tant
   * qu'une famille y vend, et il refuse TOUJOURS pour la racine. Un bouton dont
   * on sait qu'il échouera n'a pas à être armé.
   */
  protected readonly deleteAction = computed(() =>
    this.usedByCategories() === 0 && !this.isRoot() ? 'Supprimer définitivement' : undefined,
  );

  protected get canSubmit(): boolean {
    return this.draftLabel().trim() !== '' && !this.busy();
  }

  protected offers(contextKey: string): boolean {
    return this.draftContexts().includes(contextKey);
  }

  /**
   * Coche ou décoche un contexte offert.
   *
   * Décocher ne touche PAS aux tables — une grille de QR est de l'équipement,
   * pas un mode de vente. Le serveur, lui, REFUSE de retirer un contexte encore
   * vendu ici : sans ce mur, la ligne de matrice survivait à l'offre et plus
   * personne ne pouvait la décocher.
   */
  protected setOffer(contextKey: string, offered: boolean): void {
    const without = this.draftContexts().filter((key) => key !== contextKey);
    this.draftContexts.set(offered ? [...without, contextKey] : without);
  }

  /**
   * Le panneau **reste ouvert** sur un refus, et le message est celui du
   * référentiel — « Point de vente encore vendeur : 3 famille(s) » — et non le
   * `message` brut d'une `HttpErrorResponse`, qui aurait affiché « Http failure
   * response for http://… : 409 Conflict ».
   */
  protected async submit(): Promise<void> {
    await this.run(() => this.persist());
  }

  protected async remove(): Promise<void> {
    const target = this.pointOfSale();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.remove(target.id));
  }

  protected cancel(): void {
    this.ref.close();
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.ref.close(true);
    } catch (caught) {
      this.notify.refused(caught, 'Opération refusée.');
    } finally {
      this.busy.set(false);
    }
  }

  private async persist(): Promise<void> {
    const label = this.draftLabel().trim();
    if (label === '') {
      // Le bouton est désarmé sur un nom vide ; si on arrive quand même ici, se
      // taire et fermer serait annoncer un enregistrement qui n'a pas eu lieu.
      throw new Error('Le nom est obligatoire.');
    }
    const shop = this.isShop();
    const payload = {
      label,
      baseUrl: shop ? this.draftBaseUrl() : '',
      contexts: this.draftContexts(),
      tableCount: shop ? (this.draftTables() ?? 0) : 0,
    };
    const target = this.pointOfSale();
    if (target !== undefined) {
      await this.store.update(target.id, payload);
      return;
    }
    await this.store.openPointOfSale({ kind: this.draftKind(), ...payload });
  }
}
