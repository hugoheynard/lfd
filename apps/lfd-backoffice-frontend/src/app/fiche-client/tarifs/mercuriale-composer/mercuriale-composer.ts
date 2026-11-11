import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  FoldDateComponent,
  FoldInfoComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';
import type { CompanyPricingCategoryView } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';

import { NotifyService } from '../../../notify.service';
import { PricePath } from '../../../b2b/tarification/price-path/price-path';
import { VolumeEffort } from '../../../b2b/tarification/volume-effort/volume-effort';
import { PriceTemplatesService } from '../../../commercial/tarification/templates.service';
import {
  impactDirection,
  impactLabel,
  tally,
} from '../../../commercial/tarification/grille/mercuriale-row';
import { CompanyPricingService } from '../company-pricing.service';
import { SendingIntent } from '../sending-intent';
import { toLines, withEuros, type DraftPrices } from '../draft-prices';
import { policyProblem, type PromotionPolicyForm } from '../promotion-policy';
import { PromotionPolicyPicker } from '../promotion-policy-picker/promotion-policy-picker';
import {
  discountProblem,
  discountViewOf,
  type GeneralDiscountForm,
} from '../general-discount-form';
import { discountArticlesOf, discountedArticles, flooredNames } from '../general-discount-pricing';
import { discountLabel } from '../general-discount-reading';
import { GeneralDiscountPicker } from '../general-discount-picker/general-discount-picker';
import { FirmPriceField } from '../firm-price-field/firm-price-field';
import { TarifFilterBar } from '../tarif-filter-bar/tarif-filter-bar';
import { tarifShelves, type TarifRow, type TarifShelf } from '../tarif-shelves';
import { ALL_SHELVES, filterTarifRows, type FilteredTarifRow } from '../tarif-filter';
import {
  canPoseComposition,
  COMPOSER_EMPTY,
  composerRowTone,
  composerColumns,
  draftPayload,
  posePayload,
  templatePayload,
  templateRefusal,
  type Composition,
} from '../mercuriale-composition';

/**
 * **La composition d'une mercuriale** : le nom, la fenêtre, la grille de
 * saisie rayon par rayon, et les gestes qui l'écrivent (poser, brouillon,
 * gabarit, jeter).
 *
 * Les conditions et les corps envoyés sont dans `mercuriale-composition.ts`.
 * 🔴 Le brouillon, le nom et les dates restent **chez le parent** (`model`) :
 * ils survivent à une clôture ou à un renommage, qui démontent cette grille le
 * temps de relire la vue — c'est la raison d'être de `reload(…, false)`.
 *
 * N'est montée que si le staff a `b2b_pricing:write` : la page en décide.
 */
@Component({
  selector: 'app-mercuriale-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldElementTitleComponent,
    FoldInputComponent,
    FoldDateComponent,
    FoldInfoComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    FirmPriceField,
    GeneralDiscountPicker,
    PricePath,
    PromotionPolicyPicker,
    TarifFilterBar,
    VolumeEffort,
  ],
  templateUrl: './mercuriale-composer.html',
  styleUrl: './mercuriale-composer.scss',
})
export class MercurialeComposer {
  readonly companyId = input.required<string>();
  readonly categories = input.required<readonly CompanyPricingCategoryView[]>();

  /** Le libellé et la fenêtre de ce qu'on s'apprête à poser. */
  readonly label = model.required<string>();
  readonly validFrom = model.required<string>();
  readonly validTo = model.required<string>();
  readonly draft = model.required<DraftPrices>();
  /** « Promotions pour ce client » — « Aucune promotion » par défaut (§ 7). */
  readonly promotionPolicy = model.required<PromotionPolicyForm>();
  /** La remise générale envisagée ; `null` = aucune. */
  readonly generalDiscount = model<GeneralDiscountForm | null>(null);

  /** Une mercuriale vient d'être posée : au parent de relire. */
  readonly posed = output<void>();
  /** Le brouillon est jeté : au parent de refermer et de relire. */
  readonly discarded = output<void>();

  private readonly pricing = inject(CompanyPricingService);
  private readonly templates = inject(PriceTemplatesService);
  private readonly notify = inject(NotifyService);

  protected readonly euros = formatEuros;
  protected readonly percent = impactLabel;
  protected readonly direction = impactDirection;
  protected readonly busy = signal(false);

  protected readonly lines = computed(() => toLines(this.draft()));
  protected readonly discountLabel = discountLabel;

  /** Les articles à prix ferme saisi : la remise ne les touche pas (D2). */
  protected readonly firmSkus = computed<ReadonlySet<string>>(
    () => new Set(this.lines().map((line) => line.sku)),
  );
  private readonly discountView = computed(() => discountViewOf(this.generalDiscount()));
  private readonly discountArticles = computed(() => discountArticlesOf(this.categories()));
  protected readonly discountProblem = computed(() => discountProblem(this.generalDiscount()));

  /**
   * Ce que la remise fait aux articles sans prix ferme, par SKU — lu par la
   * cellule « Prix ferme » sous le champ vide. Dérivé une fois par frappe.
   */
  protected readonly discounted = computed(() =>
    discountedArticles(this.discountView(), this.discountArticles(), this.firmSkus()),
  );

  /** Q3 : les articles que la limite relèvera — dit avant de poser, sans bloquer. */
  protected readonly flooredByDiscount = computed(() =>
    flooredNames(this.discounted(), this.discountArticles()),
  );

  /**
   * **Les rayons, dérivés UNE fois par frappe** et non à chaque cycle de
   * détection.
   *
   * Une méthode appelée depuis le gabarit reconstruirait ses lignes à chaque
   * passage — et sur une table dont chaque ligne porte un champ de saisie, des
   * objets neufs à chaque cycle sont exactement ce qui fait perdre le focus sous
   * les doigts. Le `computed` ne recalcule que quand le brouillon ou la lecture
   * changent.
   */
  protected readonly shelves = computed<readonly TarifShelf[]>(() =>
    tarifShelves(this.categories(), this.draft()),
  );

  /** Le filtre de la table — état local, rien ne part au serveur. */
  protected readonly shelfFilter = signal<string>(ALL_SHELVES);
  protected readonly search = signal('');
  protected readonly pricedOnly = signal(false);

  /** « Toutes », puis une option par famille, dans l'ordre du catalogue. */
  protected readonly shelfOptions = computed(() => [
    { value: ALL_SHELVES, label: 'Toutes' },
    ...this.shelves().map((shelf) => ({ value: shelf.id, label: shelf.name })),
  ]);

  /**
   * **Une seule table**, filtrée. L'ordre reste celui du catalogue : le
   * filtre retire des lignes, il ne les déplace pas.
   */
  protected readonly rows = computed<readonly FilteredTarifRow[]>(() =>
    filterTarifRows(this.shelves(), {
      shelfId: this.shelfFilter(),
      search: this.search(),
      pricedOnly: this.pricedOnly(),
    }),
  );

  /** Ce que la grille pèse — les mêmes chiffres que sur la grille d'un gabarit. */
  protected readonly summary = computed(() => tally(this.shelves().flatMap((shelf) => shelf.rows)));

  /** Les colonnes de la grille (`composerColumns`). */
  protected readonly columns = computed(() =>
    composerColumns({
      allShelves: this.shelfFilter() === ALL_SHELVES,
      negotiated: this.shelves().some((shelf) => shelf.rows.some((row) => row.negotiated)),
      hasFirmPrices: this.lines().length > 0,
    }),
  );

  protected readonly empty = COMPOSER_EMPTY;
  protected readonly rowKey = (row: TarifRow): string => row.sku;
  protected readonly rowTone = composerRowTone;

  /** Un « Seulement celles choisies » vide ne se pose pas : le domaine le refuserait. */
  protected readonly policyProblem = computed(() => policyProblem(this.promotionPolicy()));

  private readonly composition = computed<Composition>(() => ({
    label: this.label(),
    validFrom: this.validFrom(),
    validTo: this.validTo(),
    lines: this.lines(),
    policy: this.promotionPolicy(),
    discount: this.generalDiscount(),
  }));

  /** La clé de la pose, fabriquée à l'ouverture de la composition (`SendingIntent`). */
  private readonly poseIntent = new SendingIntent();

  protected readonly canPose = computed(
    () => canPoseComposition(this.composition()) && !this.busy(),
  );

  /**
   * Le champ rend des **euros**. Le brouillon, lui, garde des millicentimes —
   * la conversion passe par une chaîne, jamais par une multiplication
   * flottante (cf. `draft-prices.ts`).
   */
  protected setEuros(sku: string, euros: number | null): void {
    this.draft.update((draft) => withEuros(draft, sku, euros));
  }

  /**
   * **Poser.** Le serveur refuse si une mercuriale couvre déjà la période, et le
   * refus la nomme : la sortie est de la clore, ce que le bandeau du haut fait.
   */
  protected async pose(): Promise<void> {
    if (!this.canPose()) {
      return;
    }
    const payload = posePayload(this.composition());
    await this.run(async () => {
      const { affectedRules } = await this.pricing.pose(
        this.companyId(),
        payload,
        this.poseIntent.keyFor(payload),
      );
      this.poseIntent.done();
      this.notify.success(`Mercuriale posée — ${String(affectedRules)} article(s).`);
      this.posed.emit();
    }, "La mercuriale n'a pas pu être posée.");
  }

  /**
   * **Garder la grille comme gabarit**, pour la reposer ailleurs.
   *
   * Le corps et le refus sont ceux de `templatePayload` / `templateRefusal`.
   */
  protected async saveAsTemplate(): Promise<void> {
    const refusal = templateRefusal(this.label(), this.lines());
    if (refusal !== null) {
      this.notify.refused(null, refusal);
      return;
    }
    await this.run(async () => {
      await this.templates.compose(templatePayload(this.label(), this.lines()));
      this.notify.success('Grille enregistrée dans les gabarits de mercuriale.');
    }, "La grille n'a pas pu être enregistrée.");
  }

  /**
   * **Enregistrer le brouillon.** Il a le droit d'être incomplet — sans nom,
   * sans dates, sans une seule ligne : c'est sa raison d'être. Le serveur ne le
   * refuse que si l'écriture échoue, jamais parce qu'il manque quelque chose.
   */
  protected async saveDraft(): Promise<void> {
    // Le contrat refuse un taux hors bornes : une remise incomplète ne
    // s'écrit pas, et le refus dit pourquoi plutôt que de la perdre.
    const problem = this.discountProblem();
    if (problem !== null) {
      this.notify.refused(null, problem);
      return;
    }
    await this.run(async () => {
      await this.pricing.saveDraft(this.companyId(), draftPayload(this.composition()));
      this.notify.success('Brouillon enregistré.');
    }, "Le brouillon n'a pas pu être enregistré.");
  }

  /** Jeter le brouillon ; le parent referme la composition et relit. */
  protected async discardDraft(): Promise<void> {
    await this.run(async () => {
      await this.pricing.discardDraft(this.companyId());
      this.discarded.emit();
      this.notify.success('Brouillon jeté.');
    }, "Le brouillon n'a pas pu être jeté.");
  }

  /** Un geste vers le serveur : la grille est occupée le temps qu'il dure, et l'échec est dit. */
  private async run(gesture: () => Promise<void>, failure: string): Promise<void> {
    this.busy.set(true);
    try {
      await gesture();
    } catch (error) {
      this.notify.error(error, failure);
    } finally {
      this.busy.set(false);
    }
  }
}
