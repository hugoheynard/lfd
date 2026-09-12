import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DeclareLegalEntityPayload, LegalEntityView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldToastService,
  type FoldBadgeVariant,
  type FoldTableColumn,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { LegalEntitiesService } from '../legal-entities.service';
import { legalEntityStateLabel, legalEntityStateVariant } from '../legal-entity-state';
import { DeclarePanel } from './declare-panel/declare-panel';

/**
 * **Comptabilité › Entités juridiques** — la liste de qui encaisse.
 *
 * ## Ce que l'écran doit dire avant tout le reste
 *
 * Une entité neuve **ne peut pas encaisser**, et c'est un état normal qui dure
 * des semaines : l'ICS arrive de la Banque de France longtemps après la
 * déclaration. Une fiche qui ressemblerait à une fiche complète pendant ce
 * temps-là ferait croire le prélèvement prêt — et le manque se découvrirait au
 * premier lot, c'est-à-dire un mois trop tard.
 *
 * D'où le parti pris : l'état est une colonne, il est **rédigé par le serveur**
 * (`canCollect`, `missingToCollect`), et l'écran ne le recalcule pas. Le
 * recalculer ici ferait une seconde définition de « complète », et celle que
 * l'utilisateur lit serait la moins surveillée des deux.
 *
 * ## Une liste, et rien d'autre
 *
 * Les gestes — ICS, compte créancier, pré-notification, archivage — vivent sur
 * la fiche de détail. Empilés sur des cartes, ils faisaient d'un écran qu'on
 * consulte pour **comparer** deux entités un formulaire de quatre écrans de
 * haut, où la seule question qu'on se pose vraiment — « laquelle peut
 * encaisser ? » — se lisait en déroulant.
 */
@Component({
  selector: 'app-entites-juridiques-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './entites-juridiques-page.html',
  styleUrl: './entites-juridiques-page.scss',
})
export class EntitesJuridiquesPage {
  private readonly api = inject(LegalEntitiesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly toasts = inject(FoldToastService);

  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Colonnes de la data-table — chaque `key` a son `<ng-template foldCell>`. */
  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Raison sociale' },
    { key: 'siren', label: 'SIREN' },
    { key: 'ics', label: 'ICS' },
    { key: 'state', label: 'État' },
    { key: 'account', label: 'Compte' },
  ];

  protected readonly rowKey = (entity: LegalEntityView): string => entity.id;

  /**
   * Aucune entité ne peut encaisser — l'avertissement de tête.
   *
   * Montré tant que RIEN n'est prêt, et non par ligne : c'est l'état du système
   * qui compte ici. Une seule entité capable suffit à prélever, et répéter
   * l'alerte sur les autres ferait du bruit sur une fiche en cours de montage.
   */
  protected readonly noneCanCollect = computed(
    () => this.entities().length > 0 && this.entities().every((entity) => !entity.canCollect),
  );

  /** Le vide, une fois la lecture faite : pendant, la table montre son attente. */
  protected readonly empty = computed(() => !this.loading() && this.entities().length === 0);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.entities.set(await this.api.list());
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Entités juridiques illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par une méthode, qui
  // rend la ligne typée au passage — plutôt que d'indexer un Record avec `any`.
  // La formulation, elle, est PARTAGÉE avec la fiche de détail : deux
  // définitions de « peut encaisser » finiraient par diverger.
  protected stateVariant(entity: LegalEntityView): FoldBadgeVariant {
    return legalEntityStateVariant(entity);
  }

  protected stateLabel(entity: LegalEntityView): string {
    return legalEntityStateLabel(entity);
  }

  protected async declare(): Promise<void> {
    const payload = await this.panels.open<DeclareLegalEntityPayload | null>(DeclarePanel, {
      width: 'md',
    }).closed;
    if (payload === undefined || payload === null) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.declare(payload);
      this.toasts.show('Entité déclarée.', 'success');
      // Une écriture, puis une RELECTURE : `canCollect` et `missingToCollect`
      // sont calculés par l'agrégat, et les deviner ici les ferait diverger au
      // premier ajout de condition.
      this.entities.set(await this.api.list());
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Enregistrement impossible.'));
    } finally {
      this.busy.set(false);
    }
  }
}
