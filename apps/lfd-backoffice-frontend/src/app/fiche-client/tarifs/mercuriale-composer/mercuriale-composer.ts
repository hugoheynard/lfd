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
  FoldNumberInputComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldTableTone,
} from 'fold-ng';
import type { CompanyPricingCategoryView } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import { MILLICENTS_PER_CENT } from '@lfd/money';

import { NotifyService } from '../../../notify.service';
import { nativeValue } from '../../../shared/native-input';
import { businessDayStart } from '../../../shared/business-day';
import { VolumeEffort } from '../../../b2b/tarification/volume-effort/volume-effort';
import { PriceTemplatesService } from '../../../commercial/tarification/templates.service';
import {
  impactDirection,
  impactLabel,
  tally,
} from '../../../commercial/tarification/grille/mercuriale-row';
import { CompanyPricingService } from '../company-pricing.service';
import { toLines, withEuros, withoutPrice, type DraftPrices } from '../draft-prices';
import { tarifShelves, type TarifRow, type TarifShelf } from '../tarif-shelves';

/** 10⁵ — d'un millicentime à l'euro. Dérivé une fois, jamais réécrit en dur. */
const MILLICENTS_PER_EURO = 100 * MILLICENTS_PER_CENT;

/**
 * **La composition d'une mercuriale** : le nom, la fenêtre, la grille de
 * saisie rayon par rayon, et les gestes qui l'écrivent (poser, brouillon,
 * gabarit, jeter).
 *
 * Sortie de `ClientTarifsPage` le 2026-10-30, sans changement de comportement.
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
    FoldNumberInputComponent,
    VolumeEffort,
  ],
  templateUrl: './mercuriale-composer.html',
  styleUrl: './mercuriale-composer.scss',
})
export class MercurialeComposer {
  readonly companyId = input.required<string>();
  readonly categories = input.required<readonly CompanyPricingCategoryView[]>();
  /** Une mercuriale non terminée occupe déjà la place : le bandeau le dit. */
  readonly blocked = input.required<boolean>();

  /** Le libellé et la fenêtre de ce qu'on s'apprête à poser. */
  readonly label = model.required<string>();
  readonly validFrom = model.required<string>();
  readonly validTo = model.required<string>();
  readonly draft = model.required<DraftPrices>();

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
  // `nativeValue` et non `$any($event.target)` : le second ment au compilateur.
  protected readonly nativeValue = nativeValue;
  protected readonly busy = signal(false);

  protected readonly lines = computed(() => toLines(this.draft()));

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

  /** Ce que la grille pèse — les mêmes chiffres que sur la grille d'un gabarit. */
  protected readonly summary = computed(() => tally(this.shelves().flatMap((shelf) => shelf.rows)));

  /**
   * Les colonnes, de gauche à droite comme la négociation se mène. Aucune n'est
   * triable : l'ordre du catalogue est le seul repère pour retrouver un article
   * deux minutes plus tard, et le perdre coûte plus qu'un tri ne rapporte.
   */
  protected readonly columns: readonly FoldTableColumn<TarifRow>[] = [
    { key: 'article', label: 'Article · tarif catalogue pro' },
    { key: 'limit', label: 'Limite', width: '8rem' },
    { key: 'price', label: 'Prix mercuriale', width: '12rem' },
    { key: 'room', label: 'Marge de négoce', width: '9rem' },
    { key: 'effort', label: 'Effort de vente', width: '12rem' },
  ];

  protected readonly empty: FoldTableEmpty = {
    title: 'Aucun article dans ce rayon',
    subtitle: 'Publiez des produits de cette famille sur le canal B2B.',
  };

  protected readonly rowKey = (row: TarifRow): string => row.sku;

  /**
   * **Le ton de ligne dit que le prix saisi ne sera pas celui facturé.**
   *
   * Ambre quand la limite a relevé la saisie — le seul fait de cette table qui
   * appelle un geste, et le seul moyen de le retrouver dans quatre-vingt-douze
   * lignes. Il est aussi **écrit** dans la cellule, donc la couleur ne le porte
   * jamais seule.
   */
  protected readonly rowTone = (row: TarifRow): FoldTableTone => (row.floored ? 'warning' : null);

  protected readonly canPose = computed(
    () =>
      this.label().trim() !== '' &&
      this.validFrom() !== '' &&
      this.validTo() !== '' &&
      this.lines().length > 0 &&
      !this.busy(),
  );

  /**
   * Le champ rend des **euros**. Le brouillon, lui, garde des millicentimes —
   * la conversion passe par une chaîne, jamais par une multiplication
   * flottante (cf. `draft-prices.ts`).
   */
  protected setEuros(sku: string, euros: number | null): void {
    this.draft.update((draft) => withEuros(draft, sku, euros));
  }

  /** Partir du tarif catalogue : le champ s'ouvre dessus, il ne s'y verrouille pas. */
  protected priceIt(sku: string, catalogMillicents: number): void {
    this.draft.update((draft) => withEuros(draft, sku, catalogMillicents / MILLICENTS_PER_EURO));
  }

  protected clear(sku: string): void {
    this.draft.update((draft) => withoutPrice(draft, sku));
  }

  /**
   * **Poser.** Le serveur refuse si une mercuriale couvre déjà la période, et le
   * refus la nomme : la sortie est de la clore, ce que le bandeau du haut fait.
   */
  protected async pose(): Promise<void> {
    if (!this.canPose()) {
      return;
    }
    this.busy.set(true);
    try {
      const { affectedRules } = await this.pricing.pose(this.companyId(), {
        label: this.label().trim(),
        // Minuit **à Paris**. Cf. `business-day.ts` : minuit UTC ouvrait la
        // mercuriale à 01 h ou 02 h du matin selon la saison, et le client
        // payait le tarif d'avant pendant ce temps-là.
        validFrom: businessDayStart(this.validFrom()) ?? '',
        validTo: businessDayStart(this.validTo()) ?? '',
        lines: [...this.lines()],
      });
      this.notify.success(`Mercuriale posée — ${String(affectedRules)} article(s).`);
      this.posed.emit();
    } catch (error) {
      this.notify.error(error, "La mercuriale n'a pas pu être posée.");
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * **Garder la grille comme gabarit**, pour la reposer ailleurs.
   *
   * Elle part sous la forme des gabarits — un palier à partir de 1 par article —
   * parce que c'est ce qu'un gabarit stocke. Ce qui est fixe ici le reste
   * là-bas ; ce n'est pas une conversion, c'est la même grille écrite dans la
   * forme que l'autre écran sait relire.
   */
  protected async saveAsTemplate(): Promise<void> {
    const label = this.label().trim();
    // 🔴 Le refus nomme CE QUI MANQUE, et les deux causes sont dites
    // séparément. Une seule phrase couvrant les deux — « Nommez la grille » —
    // accusait le nom alors que la grille était vide neuf fois sur dix : on
    // nomme sa mercuriale d'abord, puis on la garde, avant d'avoir tapé un
    // prix. Le message envoyait donc corriger le seul champ qui était rempli.
    if (label === '') {
      this.notify.refused(null, 'Nommez la grille avant de la garder comme gabarit.');
      return;
    }
    if (this.lines().length === 0) {
      this.notify.refused(
        null,
        'Aucun prix saisi : un gabarit vide ne se repose nulle part. Renseignez au moins un article.',
      );
      return;
    }
    this.busy.set(true);
    try {
      await this.templates.compose({
        kind: 'mercuriale',
        label,
        lines: this.lines().map((line) => ({
          sku: line.sku,
          tiers: [{ minQuantity: 1, unitPriceMillicents: line.unitPriceMillicents }],
          plannedVolume: null,
        })),
      });
      this.notify.success('Grille enregistrée dans les gabarits de mercuriale.');
    } catch (error) {
      this.notify.error(error, "La grille n'a pas pu être enregistrée.");
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * **Enregistrer le brouillon.** Il a le droit d'être incomplet — sans nom,
   * sans dates, sans une seule ligne : c'est sa raison d'être. Le serveur ne le
   * refuse que si l'écriture échoue, jamais parce qu'il manque quelque chose.
   */
  protected async saveDraft(): Promise<void> {
    this.busy.set(true);
    try {
      await this.pricing.saveDraft(this.companyId(), {
        label: this.label().trim(),
        validFrom: isoDay(this.validFrom()),
        validTo: isoDay(this.validTo()),
        lines: [...this.lines()],
      });
      this.notify.success('Brouillon enregistré.');
    } catch (error) {
      this.notify.error(error, "Le brouillon n'a pas pu être enregistré.");
    } finally {
      this.busy.set(false);
    }
  }

  /** Jeter le brouillon ; le parent referme la composition et relit. */
  protected async discardDraft(): Promise<void> {
    this.busy.set(true);
    try {
      await this.pricing.discardDraft(this.companyId());
      this.discarded.emit();
      this.notify.success('Brouillon jeté.');
    } catch (error) {
      this.notify.error(error, "Le brouillon n'a pas pu être jeté.");
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * `2026-01-01` → l'instant ISO de minuit **à Paris**, ou `null` si le champ est
 * vide.
 *
 * C'était minuit UTC jusqu'au 2026-09-08 — le trou T7 de l'état des lieux. La
 * brique existait déjà et servait les créneaux et les heures limites ; elle ne
 * servait simplement pas la tarification.
 */
function isoDay(day: string): string | null {
  return day === '' ? null : businessDayStart(day);
}
