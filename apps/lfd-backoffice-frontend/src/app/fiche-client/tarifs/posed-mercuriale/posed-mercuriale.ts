import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDangerZoneComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldInputComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';
import {
  POSED_MERCURIALE_STATUS_LABELS,
  type CompanyPricingCategoryView,
  type PosedMercurialeStatus,
  type PosedMercurialeView,
} from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { nativeValue } from '../../../shared/native-input';
import { staffAuthor } from '../../../shared/staff-author';
import {
  impactDirection,
  impactLabel,
} from '../../../commercial/tarification/grille/mercuriale-row';
import { CompanyPricingService } from '../company-pricing.service';
import { mercurialeCsv, mercurialeFileName } from '../mercuriale-csv';
import { MercurialeAmendments } from '../mercuriale-amendments/mercuriale-amendments';
import { mercurialeRowKey, mercurialeRows, type MercurialeRowView } from '../mercuriale-rows';

/** La couleur d'un état de mercuriale — jamais l'information seule. */
const STATUS_TONE: Readonly<Record<PosedMercurialeStatus, 'success' | 'neutral' | 'warning'>> = {
  active: 'success',
  scheduled: 'neutral',
  expired: 'neutral',
  suspended: 'warning',
};

/**
 * **Une mercuriale posée** : son entête (nom, état, fenêtre, auteur), ses
 * gestes, sa table en lecture et ses avenants.
 *
 * Sortie de `ClientTarifsPage` le 2026-10-30, sans changement de comportement,
 * pour que la page ne porte plus que l'aiguillage entre lecture et composition.
 *
 * Renommer et clore sont des **écritures** : elles ne s'offrent qu'avec
 * `b2b_pricing:write`. Le front CACHE, le serveur REFUSE — un lecteur seul ne
 * voit plus des boutons qui lui rendaient 403.
 */
@Component({
  selector: 'app-posed-mercuriale',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDangerZoneComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldInputComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    MercurialeAmendments,
  ],
  templateUrl: './posed-mercuriale.html',
  styleUrl: './posed-mercuriale.scss',
})
export class PosedMercuriale {
  readonly companyId = input.required<string>();
  readonly mercuriale = input.required<PosedMercurialeView>();
  readonly categories = input.required<readonly CompanyPricingCategoryView[]>();

  /** La mercuriale a changé (renommée, close, amendée) : au parent de relire. */
  readonly changed = output<void>();

  private readonly pricing = inject(CompanyPricingService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly euros = formatEuros;
  protected readonly percent = impactLabel;
  protected readonly direction = impactDirection;
  // `nativeValue` et non `$any($event.target)` : le second ment au compilateur.
  protected readonly nativeValue = nativeValue;
  protected readonly author = staffAuthor;
  protected readonly statusLabel = POSED_MERCURIALE_STATUS_LABELS;
  protected readonly statusTone = STATUS_TONE;

  protected readonly canWrite = computed(() => this.permissions.can('b2b_pricing:write'));
  protected readonly busy = signal(false);

  /** Le champ de nom est ouvert. */
  protected readonly renaming = signal(false);

  /** Le nom qu'on est en train de taper. Repris à chaque ouverture. */
  protected readonly newLabel = signal('');

  /** Les lignes de la mercuriale, tarif catalogue en regard. */
  protected readonly rows = computed<readonly MercurialeRowView[]>(() =>
    mercurialeRows(this.mercuriale(), this.categories()),
  );

  /**
   * Les colonnes de la table de LECTURE — celles que tu lis pour juger un tarif
   * accordé : d'où l'on part, ce qu'on a donné, et l'écart entre les deux.
   */
  protected readonly readColumns: readonly FoldTableColumn<MercurialeRowView>[] = [
    { key: 'sku', label: 'SKU', width: '8rem' },
    { key: 'productName', label: 'Article' },
    { key: 'catalog', label: 'Tarif catalogue pro', width: '11rem' },
    { key: 'negotiated', label: 'Prix mercuriale', width: '10rem' },
    { key: 'gap', label: 'Écart', width: '8rem' },
  ];

  protected readonly readRowKey = mercurialeRowKey;

  protected readonly readEmpty: FoldTableEmpty = {
    title: 'Cette mercuriale ne porte aucune ligne',
    subtitle:
      "Elle n'accorde donc rien — ce qui ne devrait pas arriver : la pose refuse une grille vide.",
  };

  /**
   * **Ouvrir le renommage**, sur le nom actuel. Pré-rempli et non vide : on
   * renomme presque toujours pour corriger, et repartir d'un champ vide ferait
   * retaper ce qu'on voulait garder.
   */
  protected startRename(): void {
    this.renaming.set(true);
    this.newLabel.set(this.mercuriale().label);
  }

  protected cancelRename(): void {
    this.renaming.set(false);
  }

  /**
   * **Renommer.** Le prix ne bouge pas — le libellé n'entre dans aucune
   * résolution ; la mercuriale a une identité en base depuis le 2026-09-08.
   * La vue est **relue** après coup par le parent : c'est la lecture qui fait
   * foi.
   */
  protected async rename(typed?: string): Promise<void> {
    // ⚠️ `typed` vient de la touche Entrée : `fold-input` ne reflète pas sa
    // frappe dans le signal AVANT que le champ perde le focus. Valider au
    // clavier sans lire le champ natif renommait avec la valeur d'avant.
    const mercuriale = this.mercuriale();
    const label = (typed ?? this.newLabel()).trim();
    if (label === '') {
      this.notify.refused(null, 'Une mercuriale ne peut pas être sans nom : il la désigne.');
      return;
    }
    if (label === mercuriale.label) {
      this.renaming.set(false);
      return;
    }
    this.busy.set(true);
    try {
      await this.pricing.rename(this.companyId(), { id: mercuriale.id, newLabel: label });
      this.renaming.set(false);
      this.notify.success('Mercuriale renommée — les prix sont inchangés.');
      this.changed.emit();
    } catch (error) {
      this.notify.error(error, "La mercuriale n'a pas pu être renommée.");
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * **Clore** : ses règles sont archivées, jamais effacées — une lecture datée
   * d'avant la clôture les retrouve, et ce qu'elles ont facturé reste figé.
   */
  protected async close(): Promise<void> {
    this.busy.set(true);
    try {
      const { affectedRules } = await this.pricing.close(this.companyId(), {
        id: this.mercuriale().id,
        reason: null,
      });
      this.notify.success(`Mercuriale close — ${String(affectedRules)} règle(s) archivée(s).`);
      this.changed.emit();
    } catch (error) {
      this.notify.error(error, "La mercuriale n'a pas pu être close.");
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * **Exporter.** Un fichier fabriqué dans le navigateur : tout ce qu'il
   * contient est déjà à l'écran.
   */
  protected exportCsv(): void {
    const mercuriale = this.mercuriale();
    const blob = new Blob([mercurialeCsv(mercuriale, this.rows())], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = mercurialeFileName(mercuriale);
    link.click();
    // Libéré tout de suite : un objet d'URL qui survit garde le fichier en
    // mémoire pour toute la session.
    URL.revokeObjectURL(url);
  }

  /** Une date ISO rendue au jour, pour l'afficher sans heure. */
  protected day(iso: string | null): string {
    return iso === null ? 'sans terme' : new Date(iso).toLocaleDateString('fr-FR');
  }
}
