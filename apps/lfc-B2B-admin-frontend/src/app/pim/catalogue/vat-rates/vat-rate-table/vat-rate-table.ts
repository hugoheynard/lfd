import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowCardDirective,
  FoldIconComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../../auth/permissions.store';
import { formatPercent } from '../../../data/channels';
import { type VatRate } from '../../catalogue-api';
import { VatRateStore } from '../vat-store';
import { SalesContextStore } from '../../../sales-contexts/sales-context-store';
import {
  VatRateFormPanel,
  type VatRatePanelData,
} from '../vat-rate-form-panel/vat-rate-form-panel';

const ALL_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'name', label: 'Nom', width: '12rem' },
  { key: 'description', label: 'Description' },
  { key: 'rate', label: 'Taux', width: '7rem' },
  // Pas de colonne « Tag » : le handle `tva-5-5` est du vocabulaire Shopify. Il
  // se dérive du taux, et se lit sur l'écran Collections, qui parle ce
  // vocabulaire-là. (Un temps renommée « Tag » au motif que le canal B2B s'en
  // servait aussi — c'était faux : la boutique B2B lit un TAUX et facture avec.)
  { key: 'usage', label: 'Utilisé par', width: '11rem' },
  { key: 'actions', label: '', align: 'right', width: '5rem' },
];

/**
 * Le **tableau des taux** de TVA. Il lit la liste depuis le {@link VatRateStore}
 * (backend) et n'expose que l'affichage : toute mutation passe par le
 * side-panel et le store, donc la liste se met à jour toute seule.
 *
 * Sur écran étroit il rend sa propre **carte** (`narrowLayout="cards"` + un
 * `foldRowCard` projeté) : `auto-cards` empile des paires libellé/valeur, donc
 * un tableau debout. Une carte n'a pas d'en-têtes de colonnes à répéter.
 *
 * Plus de barre d'outils : elle affichait « Taux de TVA » sous un titre de page
 * qui dit déjà « Taux de TVA », dans un bandeau accent qui pesait plus lourd que
 * le tableau qu'il coiffait.
 */
@Component({
  selector: 'app-vat-rate-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldIconComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    // Sans elle, `foldRowCard` n'est qu'un attribut inerte sur un `ng-template` :
    // Angular ne s'en plaint pas, le build reste vert, et la vue mobile rend le
    // vide. C'est ce qui est arrivé.
    FoldDataTableRowCardDirective,
  ],
  templateUrl: './vat-rate-table.html',
  styleUrl: './vat-rate-table.scss',
})
export class VatRateTable {
  private readonly store = inject(VatRateStore);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);
  /** Le registre : il NOMME les contextes que le compte d'usages ne fait que citer. */
  private readonly contexts = inject(SalesContextStore);

  /** Sans `tax:write`, la colonne d'actions n'a rien à proposer — on la retire. */
  protected readonly canWrite = computed(() => this.permissions.can('tax:write'));

  /** Liste réactive : suit le store, donc création / édition / suppression se voient direct. */
  protected readonly rates = this.store.items;

  protected readonly columns = computed<readonly FoldTableColumn[]>(() =>
    this.canWrite() ? ALL_COLUMNS : ALL_COLUMNS.filter((column) => column.key !== 'actions'),
  );

  /**
   * Vide **parce qu'il n'y en a pas**, ou vide **parce qu'on n'a pas pu lire** ?
   * Les deux rendaient le même écran, et le second invitait à recréer ce qui
   * existe déjà.
   */
  protected readonly emptyState = computed(() =>
    this.store.loadError() === null
      ? { title: 'Aucun taux', subtitle: 'Ajoutez-en au moins un (5,5 %, 10 %, 20 %).' }
      : { title: 'Taux illisibles', subtitle: this.store.loadError() ?? '' },
  );

  protected readonly rowKey = (rate: VatRate): string => rate.id;

  protected format(percent: number): string {
    return formatPercent(percent);
  }

  /**
   * Combien de **décisions de TVA** visent ce taux, tous contextes confondus —
   * familles ET fiches qui dérogent à la leur. Les deux posent le même
   * `RESTRICT` en base, donc les deux doivent compter, et l'écran doit les
   * NOMMER toutes les deux : « 1 famille » devant une dérogation de fiche
   * envoyait fouiller les familles, où il n'y avait rien à trouver.
   *
   * Il additionnait deux modes sur trois : un taux que seule la plateforme B2B
   * visait totalisait zéro, donc la ligne proposait de le supprimer — et la
   * base refusait, après le clic. Une somme sur la carte ne peut plus oublier
   * un contexte.
   */
  protected usageTotal(rate: VatRate): number {
    return Object.values(rate.usage).reduce((total, count) => total + count, 0);
  }

  /** « 3 à emporter · 1 sur place » — les contextes cités s'ils comptent. */
  protected usageLabel(rate: VatRate): string {
    return this.contexts
      .items()
      .filter((context) => (rate.usage[context.key] ?? 0) > 0)
      .map((context) => `${rate.usage[context.key] ?? 0} ${context.label.toLocaleLowerCase('fr')}`)
      .join(' · ');
  }

  /**
   * Ouvre le taux — une seule action par ligne, et c'est le point : le menu
   * déroulant demandait de choisir entre « Modifier » et « Supprimer » AVANT
   * d'avoir regardé l'objet. Le panneau porte les deux, la suppression dans sa
   * zone dangereuse.
   */
  protected open(rate: VatRate): void {
    const data: VatRatePanelData = { rate };
    this.panelHost.open(VatRateFormPanel, { data, side: 'right' });
  }
}
