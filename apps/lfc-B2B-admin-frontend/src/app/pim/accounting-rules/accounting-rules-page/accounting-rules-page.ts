import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { htFromTtc, proPriceOf, realDiscountBp, type ProPriceMethod } from '@lfd/pim-contracts';
import { formatCents } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { AccountingRulesStore } from '../accounting-rules.store';
import {
  DEFAULT_BROCHURE_VAT,
  brochurePolicy,
  discountToRatioBp,
  formatDiscount,
  formatDiscountBp,
  formatMillicents,
  formatSignedMillicents,
  ratioBpToDiscount,
  ratioTtcPolicy,
} from '../pro-discount';

/**
 * Le prix de DÉPART du simulateur : **10,00 € TTC**, en euros.
 *
 * Un rond, et c'est tout l'intérêt — on voit la remise sans faire
 * l'arithmétique, et on repère du coin de l'œil qu'un rapport de 90 % donne
 * 9,00 €. Ce n'est plus qu'un point de départ : le prix se saisit, parce qu'une
 * question de commercial se pose sur SON article, pas sur un article rond.
 */
const SAMPLE_START_EUR = 10;

/** D'euros saisis à centimes entiers — l'unité dans laquelle l'argent circule. */
const CENTS_PER_EUR = 100;

/**
 * **Les trois taux de la maison** — les mêmes que sur une fiche produit.
 *
 * Écrits ici plutôt que lus du référentiel, et c'est une décision : le
 * simulateur illustre une RÈGLE, il n'inventorie pas les taux posés. Les lire
 * ferait dépendre cet écran d'un autre, ferait varier l'exemple d'un jour à
 * l'autre, et laisserait un tableau vide le jour où le référentiel est vide —
 * au moment précis où l'on cherche à comprendre ce qu'on règle.
 *
 * ⚠️ Ils ne sont donc PAS la source de vérité de ce que la maison facture : les
 * taux posés vivent dans « Taux de TVA », et c'est là qu'ils se changent. Si un
 * quatrième apparaissait, cette liste ne le saurait pas — et le simulateur
 * resterait juste sur les trois qu'il montre.
 */
const SAMPLE_RATES = [5.5, 10, 20] as const;

/**
 * Les colonnes du simulateur. **Aucune colonne TTC** : les deux prix TTC sont
 * dans la phrase au-dessus, une fois, parce qu'ils ne bougent pas d'une ligne à
 * l'autre — c'est même ce que ce tableau démontre. Les répéter trois fois
 * identiques ferait chercher une différence qui n'existe pas.
 */
const SAMPLE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'rate', label: 'TVA', width: '5rem' },
  { key: 'publicHt', label: 'Public HT', align: 'right', width: '7rem' },
  { key: 'ratioTtc', label: 'Ratio TTC', align: 'right', width: '8rem' },
  { key: 'brochure', label: 'Plaquette', align: 'right', width: '8rem' },
  { key: 'gap', label: 'Écart', align: 'right', width: '8rem' },
];

/**
 * Une ligne du **comparateur** : un taux, et ce que chaque méthode en fait.
 *
 * Les deux méthodes côte à côte et leur écart sur la même ligne — c'est toute
 * la raison d'être de ce tableau. Les montrer l'une après l'autre obligerait à
 * soustraire de tête, et c'est précisément l'arithmétique que la réunion de
 * communication n'a pas faite.
 */
export interface SampleRateRow {
  /** « 5,5 % », virgule française. */
  readonly label: string;
  readonly publicHt: string;
  /** Le pro HT sous la méthode d'origine. */
  readonly ratioTtc: string;
  /** Le pro HT sous la méthode de la plaquette, `null` si elle n'est pas réglée. */
  readonly brochure: string | null;
  /** Ce que la plaquette coûte de plus (ou de moins) — signé. */
  readonly gap: string | null;
  /** La remise RÉELLE de la plaquette sur ce taux, « 20,9 % ». */
  readonly realDiscount: string | null;
}

/**
 * **Règles comptables** — ce que la maison décide une fois, pour tout le
 * catalogue.
 *
 * Une seule règle aujourd'hui : la remise professionnelle, c'est-à-dire le
 * rapport entre le prix public TTC et le prix professionnel TTC.
 *
 * Écran à part du référentiel fiscal, et pas un bloc de plus sur « Taux de
 * TVA » : un taux est imposé de l'extérieur, une remise est décidée par la
 * maison. Les ranger ensemble parce qu'ils tiennent dans la même phrase
 * (« ce qu'on facture ») mélangerait la loi et la politique commerciale.
 *
 * ⚠️ **Rien ne lit encore ce rapport.** Aucun prix ne change tant que la
 * tranche 4 ne l'a pas raccordé — et l'écran le dit, plutôt que de laisser
 * croire qu'une saisie ici retarife le catalogue.
 */
@Component({
  selector: 'app-accounting-rules-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldNumberInputComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
  ],
  templateUrl: './accounting-rules-page.html',
  styleUrl: './accounting-rules-page.scss',
})
export class AccountingRulesPage {
  private readonly store = inject(AccountingRulesStore);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  /**
   * Poser la remise est un droit à part (`pim_tax:write`, la comptabilité l'a) —
   * le même que les taux, et pour la même raison : c'est une décision
   * comptable, pas une édition de catalogue. Le front cache, le serveur
   * refuse : ce test évite d'offrir un formulaire qui répondrait 403.
   */
  protected readonly canWrite = computed(() => this.permissions.can('pim_tax:write'));

  protected readonly isLoading = this.store.isLoading;
  protected readonly loadError = this.store.loadError;

  /** Le rapport enregistré, ou `null` : **jamais réglé**. */
  protected readonly savedRatioBp = computed(() => this.store.rules().ratioBp);

  /** La saisie, en **remise** (%) — le mot qu'on emploie, pas celui qu'on stocke. */
  protected readonly draftDiscount = signal<number | null>(null);

  /**
   * **Le prix d'étiquette du simulateur**, en euros, et il se saisit.
   *
   * 🔴 Il ne s'enregistre PAS, et rien dans cet écran ne le persiste : ce n'est
   * pas une décision, c'est une question — « et sur mon article à 2,40 € ? ».
   * Le confondre avec la remise ferait croire qu'on règle un prix ici, alors
   * que cet écran ne pose qu'un rapport, valable pour tout le catalogue.
   *
   * Il vit donc à part de `draftDiscount`, et aucun bouton ne le concerne.
   */
  protected readonly samplePublicEur = signal<number | null>(SAMPLE_START_EUR);
  protected readonly busy = signal(false);

  /** La méthode **appliquée** — celle dont le push se sert. */
  protected readonly savedMethod = computed(() => this.store.rules().method);
  protected readonly savedFixedVat = computed(() => this.store.rules().fixedVatPercent);

  /** La méthode qu'on s'apprête à choisir, et son taux figé. */
  protected readonly draftMethod = signal<ProPriceMethod>('ratio_ttc');
  protected readonly draftFixedVat = signal<number | null>(DEFAULT_BROCHURE_VAT);

  constructor() {
    // Le champ suit ce que le serveur affirme, y compris après enregistrement.
    // Rien réglé ⇒ champ vide : pré-remplir à 0 proposerait « aucune remise »
    // comme s'il s'agissait d'un défaut.
    effect(() => {
      const saved = this.savedRatioBp();
      this.draftDiscount.set(saved === null ? null : ratioBpToDiscount(saved));
    });
    // Même règle pour la méthode : le champ suit ce que le serveur affirme. Le
    // taux figé garde son défaut quand il n'y en a pas — c'est une proposition
    // de saisie, pas un réglage, et il ne partira que si la plaquette est
    // choisie.
    effect(() => {
      this.draftMethod.set(this.savedMethod());
      this.draftFixedVat.set(this.savedFixedVat() ?? DEFAULT_BROCHURE_VAT);
    });
  }

  /** Le rapport que la saisie produirait — `null` si elle n'est pas posable. */
  protected readonly draftRatioBp = computed(() => {
    const discount = this.draftDiscount();
    return discount === null ? null : discountToRatioBp(discount);
  });

  /** La pastille : « −10 % », ou ce qui manque encore. */
  protected readonly savedLabel = computed(() => {
    const saved = this.savedRatioBp();
    return saved === null ? 'à régler' : formatDiscount(saved);
  });

  /**
   * Le prix saisi, en centimes entiers — ou `null` si la saisie ne fait pas un
   * prix.
   *
   * Zéro est **refusé** plutôt que calculé : une remise sur un article gratuit
   * rendrait une colonne de zéros, ce qui ressemble à une panne. Un prix négatif
   * n'est pas un prix.
   */
  protected readonly samplePublicCents = computed(() => {
    const eur = this.samplePublicEur();
    if (eur === null || !Number.isFinite(eur) || eur <= 0) {
      return null;
    }
    return Math.round(eur * CENTS_PER_EUR);
  });

  /** Le prix public de l'exemple, formaté. */
  protected readonly samplePublic = computed(() => {
    const cents = this.samplePublicCents();
    return cents === null ? null : formatCents(cents);
  });

  /**
   * Ce que la saisie produirait sur un article à 10,00 € TTC.
   *
   * Le calcul vient de `@lfd/pim-contracts`, le même que celui du serveur :
   * un aperçu qui arrondirait autrement que la facture serait pire qu'aucun
   * aperçu.
   */
  protected readonly sampleProCents = computed(() => {
    const ratioBp = this.draftRatioBp();
    const publicCents = this.samplePublicCents();
    if (ratioBp === null || publicCents === null) {
      return null;
    }
    // Le TTC pro de la méthode CHOISIE — c'est ce que l'écran doit annoncer, et
    // c'est ce que le fil pousse. La phrase au-dessus du tableau lit ce nombre.
    //
    // Le taux de référence de l'exemple est le plus BAS des trois, parce que
    // c'est là que les deux méthodes s'écartent le plus : montrer l'écart sur
    // 20 %, où elles coïncident, laisserait croire qu'il n'y en a pas.
    return proPriceOf(publicCents, this.appliedPolicy(ratioBp), SAMPLE_RATES[0])?.ttcCents ?? null;
  });

  /** Le réglage tel qu'il partirait, saisie comprise. */
  private readonly appliedPolicy = (ratioBp: number) => ({
    method: this.draftMethod(),
    ratioBp,
    fixedVatPercent: this.draftMethod() === 'remise_apres_tva_max' ? this.draftFixedVat() : null,
  });

  protected readonly samplePro = computed(() => {
    const cents = this.sampleProCents();
    return cents === null ? null : formatCents(cents);
  });

  protected readonly sampleColumns = SAMPLE_COLUMNS;

  /** Le taux identifie sa ligne : il est unique par construction. */
  protected readonly rateKey = (row: SampleRateRow): string => row.label;

  /**
   * **Le même article sous les trois taux** — ce que la fiche produit montre.
   *
   * 🔴 Ce tableau existe pour rendre VISIBLE la phrase qui le précède : la
   * remise porte sur le **TTC**, donc les deux prix TTC ne bougent pas d'une
   * ligne à l'autre. Ce qui bouge est le hors taxe, et il bouge beaucoup —
   * 9,48 € à 5,5 %, 8,33 € à 20 % pour le même prix d'étiquette. Quelqu'un qui
   * raisonne en HT et change de contexte de vente n'a aucune raison de le
   * deviner.
   *
   * ⚠️ **Le pro HT se déduit du pro TTC**, jamais du public HT multiplié par le
   * rapport. Les deux tombent presque toujours sur le même centime, et
   * « presque » est le problème : la facture, elle, suit la première chaîne —
   * prix public TTC, puis remise, puis taux. Un simulateur qui prendrait l'autre
   * chemin annoncerait un jour un centime que la facture dément. Un cas le tient,
   * vérifié par mutation le 2026-09-09.
   */
  protected readonly sampleRates = computed<readonly SampleRateRow[] | null>(() => {
    const ratioBp = this.draftRatioBp();
    const publicTtc = this.samplePublicCents();
    if (ratioBp === null || publicTtc === null) {
      return null;
    }
    const fixedVat = this.draftFixedVat();
    return SAMPLE_RATES.map((rate) => {
      const ratio = proPriceOf(publicTtc, ratioTtcPolicy(ratioBp), rate);
      const brochure =
        fixedVat === null ? null : proPriceOf(publicTtc, brochurePolicy(ratioBp, fixedVat), rate);
      const gapMillicents =
        brochure === null || ratio === null ? null : brochure.htMillicents - ratio.htMillicents;
      return {
        label: `${String(rate).replace('.', ',')} %`,
        publicHt: formatCents(htFromTtc(publicTtc, rate)),
        ratioTtc: ratio === null ? '—' : formatMillicents(ratio.htMillicents),
        brochure: brochure === null ? null : formatMillicents(brochure.htMillicents),
        gap: gapMillicents === null ? null : formatSignedMillicents(gapMillicents),
        realDiscount:
          brochure === null ? null : formatDiscountBp(realDiscountBp(publicTtc, brochure.ttcCents)),
      };
    });
  });

  /** La méthode de la plaquette est-elle **choisie** ? Le formulaire s'y adapte. */
  protected readonly draftIsBrochure = computed(
    () => this.draftMethod() === 'remise_apres_tva_max',
  );

  /**
   * Rien à enregistrer si la méthode saisie est identique à celle appliquée, ou
   * si la plaquette est choisie sans son taux — une méthode qui prétend retirer
   * une TVA sans savoir laquelle ne doit pas partir.
   */
  protected readonly canChooseMethod = computed(() => {
    const method = this.draftMethod();
    const fixedVat = method === 'remise_apres_tva_max' ? this.draftFixedVat() : null;
    if (method === 'remise_apres_tva_max' && (fixedVat === null || fixedVat < 0)) {
      return false;
    }
    return !this.busy() && (method !== this.savedMethod() || fixedVat !== this.savedFixedVat());
  });

  protected chooseMethod(method: ProPriceMethod): void {
    this.draftMethod.set(method);
  }

  protected async submitMethod(): Promise<void> {
    const method = this.draftMethod();
    const fixedVat = method === 'remise_apres_tva_max' ? this.draftFixedVat() : null;
    this.busy.set(true);
    try {
      await this.store.chooseProPriceMethod(method, fixedVat);
      this.notify.success('Méthode de calcul appliquée.');
    } catch (caught) {
      this.notify.refused(caught, 'Changement de méthode refusé.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Rien à enregistrer si la saisie est invalide, ou identique à l'enregistré. */
  protected readonly canSubmit = computed(() => {
    const ratioBp = this.draftRatioBp();
    return ratioBp !== null && ratioBp !== this.savedRatioBp() && !this.busy();
  });

  protected async submit(): Promise<void> {
    const ratioBp = this.draftRatioBp();
    if (ratioBp === null) {
      return;
    }
    this.busy.set(true);
    try {
      await this.store.setProPriceRatio(ratioBp);
      this.notify.success('Remise professionnelle enregistrée.');
    } catch (caught) {
      // Le champ reste garni : le message dit pourquoi, et la correction se
      // fait sur place.
      this.notify.refused(caught, 'Enregistrement refusé.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async retry(): Promise<void> {
    await this.store.reload().catch(() => undefined);
  }
}
