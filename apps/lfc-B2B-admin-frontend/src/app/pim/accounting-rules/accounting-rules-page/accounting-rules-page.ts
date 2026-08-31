import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { proPriceFromPublic } from '@lfd/pim-contracts';
import { formatCents } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { AccountingRulesStore } from '../accounting-rules.store';
import { discountToRatioBp, formatDiscount, ratioBpToDiscount } from '../pro-discount';

/**
 * Le prix qui sert l'exemple : **10,00 € TTC**, en centimes.
 *
 * Un rond, et c'est tout l'intérêt — le lecteur voit la remise sans avoir à
 * faire l'arithmétique, et repère du coin de l'œil qu'un rapport de 90 % donne
 * 9,00 €. Un prix réaliste tiré du catalogue ferait mieux illusion et moins
 * bien son travail.
 */
const SAMPLE_PUBLIC_TTC_CENTS = 1_000;

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
  ],
  templateUrl: './accounting-rules-page.html',
  styleUrl: './accounting-rules-page.scss',
})
export class AccountingRulesPage {
  private readonly store = inject(AccountingRulesStore);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  /**
   * Poser la remise est un droit à part (`tax:write`, la comptabilité l'a) —
   * le même que les taux, et pour la même raison : c'est une décision
   * comptable, pas une édition de catalogue. Le front cache, le serveur
   * refuse : ce test évite d'offrir un formulaire qui répondrait 403.
   */
  protected readonly canWrite = computed(() => this.permissions.can('tax:write'));

  protected readonly isLoading = this.store.isLoading;
  protected readonly loadError = this.store.loadError;

  /** Le rapport enregistré, ou `null` : **jamais réglé**. */
  protected readonly savedRatioBp = computed(() => this.store.rules().ratioBp);

  /** La saisie, en **remise** (%) — le mot qu'on emploie, pas celui qu'on stocke. */
  protected readonly draftDiscount = signal<number | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    // Le champ suit ce que le serveur affirme, y compris après enregistrement.
    // Rien réglé ⇒ champ vide : pré-remplir à 0 proposerait « aucune remise »
    // comme s'il s'agissait d'un défaut.
    effect(() => {
      const saved = this.savedRatioBp();
      this.draftDiscount.set(saved === null ? null : ratioBpToDiscount(saved));
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

  /** Le prix public de l'exemple, formaté. */
  protected readonly samplePublic = formatCents(SAMPLE_PUBLIC_TTC_CENTS);

  /**
   * Ce que la saisie produirait sur un article à 10,00 € TTC.
   *
   * Le calcul vient de `@lfd/pim-contracts`, le même que celui du serveur :
   * un aperçu qui arrondirait autrement que la facture serait pire qu'aucun
   * aperçu.
   */
  protected readonly samplePro = computed(() => {
    const ratioBp = this.draftRatioBp();
    return ratioBp === null
      ? null
      : formatCents(proPriceFromPublic(SAMPLE_PUBLIC_TTC_CENTS, ratioBp));
  });

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
