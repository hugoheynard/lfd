import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  COLLECTION_EXCLUSION_REASON_LABELS,
  type CollectionExclusionView,
  type CollectionPreviewOpenView,
  type CollectionPreviewView,
  type LegalEntityView,
  type SepaScheme,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { saveBlob } from '../../../shared/download/save-blob';
import {
  currentMonthName,
  emptyPreviewSentence,
  longDay,
  notYetOpenSentence,
} from '../../collection-month-wording';
import { ComptabiliteDashboardService } from '../../comptabilite-dashboard.service';
import { euros, signedEuros } from '../../invoice-dossier-format';

const LINE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'debtor', label: 'Payeur' },
  { key: 'scheme', label: 'Schéma' },
  { key: 'orders', label: 'Bons', numeric: true },
  { key: 'ordersTotal', label: 'Σ bons', numeric: true },
  { key: 'billed', label: 'Facturé (prélevé)', numeric: true },
  { key: 'gap', label: 'Écart', numeric: true },
];

const EXCLUSION_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'order', label: 'Bon' },
  { key: 'company', label: 'Société' },
  { key: 'amount', label: 'Montant', numeric: true },
  { key: 'reason', label: 'Raison' },
];

interface PreviewLineRow {
  readonly key: string;
  readonly debtorName: string;
  readonly scheme: SepaScheme;
  readonly orderCount: number;
  readonly ordersTotal: string;
  readonly billed: string;
  readonly gap: string;
}

/**
 * **Le mois en cours** — ce que la prochaine préparation du lot prélèverait
 * (plan `prelevement-automatique.md`, PA4).
 *
 * ## Le serveur calcule, l'écran soustrait
 *
 * Chaque ligne est la facture de ses bons, calculée par le même chemin que le
 * lot ; l'écran n'ajoute que l'écart (facturé − Σ bons). Une somme des bons
 * faite ici annoncerait un autre montant que celui du fichier.
 *
 * ## Vide n'est jamais muet
 *
 * « Pas encore prélevable » nomme la clôture du premier mois prélevable ; un
 * aperçu vide dit qu'il ne reste rien depuis la mise en service. Un zéro sans
 * phrase ferait chercher une panne.
 *
 * Les aperçus du fichier (XML par schéma, et leur contrôle) viennent du
 * tableau de bord, qui ne garde plus qu'un résumé : ils ne se déposent
 * jamais — le fichier déposé est celui du lot préparé.
 */
@Component({
  selector: 'app-month-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldIconComponent,
    RouterLink,
  ],
  templateUrl: './month-preview.html',
  styleUrl: './month-preview.scss',
})
export class MonthPreview {
  private readonly drafts = inject(ComptabiliteDashboardService);

  readonly entity = input.required<LegalEntityView>();
  readonly preview = input.required<CollectionPreviewView | null>();
  /** L'échec de l'aperçu est PARTIEL : le reste de l'écran tient. */
  readonly error = input<string | null>(null);

  protected readonly lineColumns = LINE_COLUMNS;
  protected readonly exclusionColumns = EXCLUSION_COLUMNS;
  protected readonly lineKey = (row: PreviewLineRow): string => row.key;
  protected readonly exclusionKey = (row: CollectionExclusionView): string => row.orderId;
  protected readonly schemes: readonly SepaScheme[] = ['CORE', 'B2B'];
  protected readonly busy = signal(false);
  protected readonly downloadError = signal<string | null>(null);

  protected readonly title = computed(
    () => `Le mois en cours — ${currentMonthName(this.entity().nextCollection.closesAt)}`,
  );
  protected readonly subtitle = computed(
    () =>
      `Aperçu de ce qui serait prélevé à la fin du mois (${longDay(this.entity().nextCollection.closesAt)}), ` +
      'calculé comme le lot : une facture par payeur. Rien n’est figé.',
  );

  protected readonly open = computed((): CollectionPreviewOpenView | null => {
    const view = this.preview();
    return view?.state === 'open' ? view : null;
  });

  protected readonly notYetOpen = computed(() => {
    const view = this.preview();
    return view?.state === 'not_yet_open'
      ? notYetOpenSentence(view.floorAt, view.firstClosureAt)
      : null;
  });

  protected readonly empty = computed(() => {
    const view = this.open();
    return view !== null && view.lines.length === 0 && view.exclusions.length === 0
      ? emptyPreviewSentence(view.floorAt)
      : null;
  });

  protected readonly totals = computed(() => {
    const view = this.open();
    return view === null
      ? null
      : {
          billed: euros(view.totalCents),
          orders: euros(view.ordersTotalCents),
          gap: signedEuros(view.totalCents - view.ordersTotalCents),
          payers: view.lines.length,
        };
  });

  protected readonly rows = computed((): readonly PreviewLineRow[] =>
    (this.open()?.lines ?? []).map((line) => ({
      key: `${line.scheme}-${line.payerCompanyId}`,
      debtorName: line.debtorName,
      scheme: line.scheme,
      orderCount: line.orderCount,
      ordersTotal: euros(line.ordersTotalCents),
      billed: euros(line.amountCents),
      gap: signedEuros(line.amountCents - line.ordersTotalCents),
    })),
  );

  /** Les bons non facturables, nommés en tête : ils ne partiraient pas. */
  protected readonly unbillable = computed(() =>
    (this.open()?.exclusions ?? [])
      .filter((exclusion) => exclusion.reason === 'unbillable')
      .map((exclusion) => `${exclusion.orderNumber} (${exclusion.companyName})`),
  );

  protected reasonOf(row: CollectionExclusionView): string {
    return COLLECTION_EXCLUSION_REASON_LABELS[row.reason];
  }

  protected cents(amount: number): string {
    return euros(amount);
  }

  /** L'aperçu du fichier d'un schéma, ou son contrôle — jamais déposable. */
  protected async download(scheme: SepaScheme, kind: 'xml' | 'csv'): Promise<void> {
    const entity = this.entity();
    this.busy.set(true);
    this.downloadError.set(null);
    try {
      const file =
        kind === 'xml'
          ? await this.drafts.cycleDraft(entity.id, scheme)
          : await this.drafts.cycleDraftAudit(entity.id, scheme);
      const fallback =
        kind === 'xml'
          ? `BROUILLON-prelevement-${entity.siren}-${scheme}.xml`
          : `CONTROLE-prelevement-${entity.siren}-${scheme}.csv`;
      saveBlob(file.blob, file.fileName ?? fallback);
    } catch (caught) {
      this.downloadError.set(httpErrorMessage(caught, 'Téléchargement impossible.'));
    } finally {
      this.busy.set(false);
    }
  }
}
