import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  FoldPanelHostService,
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
  type PromotionView,
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
import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import { CompanyPricingService } from '../company-pricing.service';
import {
  NO_PROMOTION_POLICY,
  POLICY_SUMMARY_LABEL,
  originPhrase,
  policyOrigin,
  policyPhrase,
} from '../promotion-policy';
import { discountSummary, firmSummary } from '../posed-summary';
import { mercurialeCsv, mercurialeFileName, type DiscountedCsvRow } from '../mercuriale-csv';
import { discountArticlesOf, discountedArticles, discountNames } from '../general-discount';
import { MercurialeAmendments } from '../mercuriale-amendments/mercuriale-amendments';
import {
  CorrectWindowPanel,
  type CorrectWindowPanelData,
} from '../correct-window-panel/correct-window-panel';
import { mercurialeRowKey, mercurialeRows, type MercurialeRowView } from '../mercuriale-rows';

/** La couleur d'un état de mercuriale — jamais l'information seule. */
const STATUS_TONE: Readonly<Record<PosedMercurialeStatus, 'success' | 'neutral' | 'warning'>> = {
  active: 'success',
  scheduled: 'neutral',
  expired: 'neutral',
  suspended: 'warning',
};

/**
 * **Une mercuriale posée** : son entête (nom, état, fenêtre, auteur) et ses
 * gestes, trois blocs de résumé (prix fermes, remise générale, cumul des
 * promotions), sa table en lecture et ses avenants.
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
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldElementTitleComponent,
    FoldInputComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    MercurialeAmendments,
  ],
  templateUrl: './posed-mercuriale.html',
  styleUrl: './posed-mercuriale.scss',
})
export class PosedMercuriale implements OnInit {
  readonly companyId = input.required<string>();
  readonly mercuriale = input.required<PosedMercurialeView>();
  readonly categories = input.required<readonly CompanyPricingCategoryView[]>();

  /** La mercuriale a changé (renommée, close) : au parent de relire. */
  readonly changed = output<void>();
  /** « Modifier par avenant » : au parent d'ouvrir la table de l'avenant. */
  readonly amend = output<void>();

  private readonly pricing = inject(CompanyPricingService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly promotionsApi = inject(PromotionsService);
  private readonly panels = inject(FoldPanelHostService);

  /**
   * Les promotions, pour NOMMER celles d’un « Seulement celles choisies ». `null` tant qu'elles
   * ne sont pas lues ; une lecture ratée laisse les identifiants à l'écran et
   * le dit (`promotionsMissing`) — la politique, elle, reste lisible.
   */
  protected readonly promotions = signal<readonly PromotionView[] | null>(null);
  protected readonly promotionsMissing = signal(false);

  /** Le cumul en vigueur, en réponse : « Non », « Oui, toutes », « Seulement Rentrée ». */
  protected readonly policyLine = computed(() => {
    const answer = policyPhrase(
      this.mercuriale().promotionPolicy ?? NO_PROMOTION_POLICY,
      this.promotions(),
    );
    return answer.charAt(0).toUpperCase() + answer.slice(1);
  });
  protected readonly policyLabel = POLICY_SUMMARY_LABEL;
  /** « depuis la pose » ou « depuis l'avenant du … ». */
  protected readonly policySince = computed(() =>
    originPhrase(policyOrigin(this.mercuriale(), new Date())),
  );

  /**
   * La remise générale **en vigueur**, lue : sa tête et ses lignes, cibles
   * nommées. `null` = aucune. Elle se change par avenant daté.
   */
  private readonly names = computed(() => discountNames(this.categories()));

  /**
   * Les articles que la remise générale EN VIGUEUR fait, pour l'export : le
   * prix ferme l'emporte, la limite relève.
   */
  private readonly discountedRows = computed((): readonly DiscountedCsvRow[] => {
    const articles = discountArticlesOf(this.categories());
    const verdicts = discountedArticles(
      this.mercuriale().generalDiscount ?? null,
      articles,
      new Set(this.rows().map((row) => row.sku)),
    );
    return articles.flatMap((article) => {
      const verdict = verdicts.get(article.sku);
      return verdict === undefined
        ? []
        : [
            {
              ...verdict,
              sku: article.sku,
              name: article.name,
              canonicalMillicents: article.canonicalMillicents,
            },
          ];
    });
  });
  protected readonly discount = computed(() =>
    discountSummary(this.mercuriale().generalDiscount ?? null, this.names()),
  );

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
  /** Le bloc « Prix fermes » : combien, et l'écart moyen au catalogue. */
  protected readonly firm = computed(() =>
    firmSummary(
      this.mercuriale().skuCount,
      this.rows().map((row) => row.gapBp),
    ),
  );

  protected readonly readColumns: readonly FoldTableColumn<MercurialeRowView>[] = [
    { key: 'sku', label: 'SKU', width: '8rem' },
    { key: 'productName', label: 'Article' },
    { key: 'catalog', label: 'Tarif catalogue pro', width: '11rem' },
    { key: 'negotiated', label: 'Prix ferme', width: '10rem' },
    { key: 'gap', label: 'Écart', width: '8rem' },
  ];

  protected readonly readRowKey = mercurialeRowKey;

  /**
   * Une mercuriale sans prix ferme est normale quand elle porte une remise
   * générale : la table vide le dit, au lieu de crier à l'anomalie.
   */
  protected readonly readEmpty = computed((): FoldTableEmpty =>
    (this.mercuriale().generalDiscount ?? null) !== null
      ? {
          title: 'Aucun prix ferme',
          subtitle:
            'Les prix de ce client viennent de la remise générale. « Modifier par avenant » pour en fixer un.',
        }
      : {
          title: 'Aucun prix ferme ni remise',
          subtitle:
            "Cette mercuriale n'accorde rien aujourd'hui : ses prix ou sa remise ont été arrêtés.",
        },
  );

  ngOnInit(): void {
    this.promotionsApi.list().then(
      (list) => this.promotions.set(list.promotions),
      () => this.promotionsMissing.set(true),
    );
  }

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
   * **Corriger les dates**, dans un panneau — seulement à venir : une
   * mercuriale commencée garde ses dates. Après succès, la fiche se relit.
   */
  protected async correctWindow(): Promise<void> {
    const ref = this.panels.open<CorrectWindowPanelData, boolean>(CorrectWindowPanel, {
      data: { companyId: this.companyId(), mercuriale: this.mercuriale() },
    });
    if ((await ref.closed) === true) {
      this.notify.success('Dates de la mercuriale corrigées.');
      this.changed.emit();
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
    const blob = new Blob(
      [mercurialeCsv(mercuriale, this.rows(), this.names(), this.discountedRows())],
      {
        type: 'text/csv;charset=utf-8',
      },
    );
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
