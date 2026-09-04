import { LowerCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  categoryPathOf,
  explainOrderTimeLimit,
  type OrderTimeLimitScopeType,
  type OrderTimeLimitView,
} from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { CategoryStore } from '../../../category-store';
import {
  daysPhrase,
  gracePhrase,
  provenanceLabel,
  timePhrase,
} from '../../../../order-time-limits/limit-format';
import { LimitPanel } from '../../../../order-time-limits/limit-panel/limit-panel';
import { OrderTimeLimitsService } from '../../../../order-time-limits/order-time-limits.service';
import { ProductFormStore } from '../../product-form-store';
import { limitApplies, ownRule, type OrderLimitRow } from './order-limit-row';

/**
 * **Limite de commande** — jusqu'à quand on prend commande de cet article.
 *
 * ## Elle montre ce qui S'APPLIQUE, pas seulement ce qui est posé
 *
 * Une carte qui n'afficherait que la règle propre à cette fiche écrirait
 * « Hérité » sans dire de quoi — c'est-à-dire rien. L'écran résout donc
 * l'échelle entière et nomme, **pour chaque valeur**, le rang qui la pose : une
 * heure peut venir de la famille, un délai de la fiche et un rattrapage du
 * réglage général, sur la même ligne.
 *
 * La résolution est celle du référentiel, importée du contrat. La recopier ici
 * aurait été le pire des deux mondes : l'écran et la commande ne se lisent pas
 * au même endroit, donc leur désaccord n'aurait sauté aux yeux de personne.
 *
 * ## L'alignement suit l'idiome de la fiche
 *
 * Sur la déclinaison **par défaut**, pas de case : c'est elle qui porte la
 * limite de la fiche, comme pour les autres cartes. Sur une autre, la case
 * « Aligner sur la fiche » — cochée, la déclinaison ne pose rien et suit ;
 * décochée, elle a la sienne.
 *
 * ## Elle ne participe PAS à l'enregistrement de la fiche
 *
 * La limite vit dans un autre contexte, avec sa propre route. Le panneau écrit
 * seul en se fermant, et la case écrit immédiatement — rien à accrocher au garde
 * « modifications non enregistrées », et rien à perdre en quittant l'écran.
 */
@Component({
  selector: 'app-order-limit-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    LowerCasePipe,
    RouterLink,
  ],
  templateUrl: './order-limit-form.html',
  styleUrls: ['../form-section.scss', './order-limit-form.scss'],
})
export class OrderLimitForm {
  private readonly api = inject(OrderTimeLimitsService);
  private readonly categories = inject(CategoryStore);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(ProductFormStore);

  private readonly rules = signal<readonly OrderTimeLimitView[]>([]);
  protected readonly failed = signal(false);
  protected readonly pendingRemoval = signal<string | null>(null);

  /** La lignée de familles de cette fiche, la plus proche d'abord. */
  private readonly categoryPath = computed(() =>
    categoryPathOf(this.categories.items(), this.store.categoryId()),
  );

  /**
   * La ligne de **la fiche** : ce qu'elle pose, et ce qui s'applique à elle
   * quand aucune déclinaison ne s'en écarte.
   */
  protected readonly productRow = computed<OrderLimitRow | null>(() => {
    const productId = this.store.productId();
    if (productId === '') {
      return null;
    }
    return {
      scopeType: 'product',
      scopeId: productId,
      label: 'Cette fiche',
      rule: ownRule(this.rules(), 'product', productId),
      effective: explainOrderTimeLimit(this.rules(), {
        variantId: null,
        productId,
        categoryPath: this.categoryPath(),
      }),
    };
  });

  /** La ligne de la déclinaison ouverte, ou `null` s'il n'y en a pas. */
  protected readonly variantRow = computed<OrderLimitRow | null>(() => {
    const productId = this.store.productId();
    const variantId = this.store.selectedVariantId();
    if (productId === '' || variantId === '') {
      return null;
    }
    return {
      scopeType: 'variant',
      scopeId: variantId,
      label: 'Cette déclinaison',
      rule: ownRule(this.rules(), 'variant', variantId),
      effective: explainOrderTimeLimit(this.rules(), {
        variantId,
        productId,
        categoryPath: this.categoryPath(),
      }),
    };
  });

  /**
   * La déclinaison **suit la fiche** — c'est-à-dire qu'elle ne pose rien.
   *
   * L'alignement n'est pas un drapeau stocké : c'est l'ABSENCE d'une règle sur
   * la portée `variant`. Un drapeau en plus aurait pu contredire la règle qu'il
   * décrit, et il aurait fallu décider lequel des deux fait foi.
   */
  protected readonly variantAligned = computed(() => this.variantRow()?.rule == null);

  /**
   * La case ne s'affiche **pas sur la déclinaison par défaut**, comme sur les
   * autres cartes : c'est elle qui porte ce que la fiche déclare, elle ne peut
   * pas s'aligner sur elle-même.
   */
  protected readonly canAlign = computed(
    () => this.variantRow() !== null && !this.store.editingDefault(),
  );

  /** La ligne qu'on montre : celle de la déclinaison si elle s'écarte, sinon la fiche. */
  protected readonly shown = computed<OrderLimitRow | null>(() =>
    this.canAlign() && !this.variantAligned() ? this.variantRow() : this.productRow(),
  );

  /**
   * La ligne montrée est-elle **modifiable ici** ?
   *
   * Sur une déclinaison alignée, non : ce qu'on lit est porté par la fiche, et
   * c'est en ouvrant la déclinaison par défaut qu'on le change — exactement ce
   * que disent les autres cartes portées par le produit.
   */
  protected readonly editable = computed(() => !this.canAlign() || !this.variantAligned());

  constructor() {
    // Rechargé quand la fiche change d'identité : rester sur les règles de la
    // précédente ferait modifier un article en croyant en modifier un autre.
    effect(() => {
      if (this.store.productId() !== '') {
        void this.load();
      }
    });
  }

  protected async load(): Promise<void> {
    try {
      this.rules.set(await this.api.list());
      this.failed.set(false);
    } catch {
      // On ne montre pas une carte vide : « aucune limite » et « on n'a pas pu
      // lire » ne se ressemblent que sur un écran mal fait.
      this.failed.set(true);
    }
  }

  protected applies(row: OrderLimitRow): boolean {
    return limitApplies(row.effective);
  }

  protected days(row: OrderLimitRow): string {
    return daysPhrase(row.effective.daysBefore?.value ?? null);
  }

  protected time(row: OrderLimitRow): string {
    return timePhrase(row.effective.time?.value ?? null);
  }

  /** `null` = personne ne le pose ⇒ limite ferme, et c'est une réponse. */
  protected grace(row: OrderLimitRow): string {
    return gracePhrase(row.effective.graceMinutes?.value ?? 0);
  }

  /** D'où vient cette valeur, ou `null` quand c'est cette portée qui la pose. */
  protected fromDays(row: OrderLimitRow): string | null {
    return this.origin(row, row.effective.daysBefore?.from);
  }

  protected fromTime(row: OrderLimitRow): string | null {
    return this.origin(row, row.effective.time?.from);
  }

  protected fromGrace(row: OrderLimitRow): string | null {
    return this.origin(row, row.effective.graceMinutes?.from);
  }

  protected async onAlign(aligned: boolean): Promise<void> {
    const row = this.variantRow();
    if (row === null) {
      return;
    }
    if (!aligned) {
      this.edit(row);
      return;
    }
    if (row.rule !== null) {
      await this.remove(row.rule);
    }
  }

  protected edit(row: OrderLimitRow): void {
    const ref = this.panelHost.open(LimitPanel, {
      data: {
        rule: row.rule,
        categories: [],
        preset: { scope: { type: row.scopeType, id: row.scopeId }, label: row.label },
      },
    });
    void ref.closed.then((saved) => {
      if (saved === true) {
        void this.load();
      }
    });
  }

  protected askRemove(rule: OrderTimeLimitView): void {
    this.pendingRemoval.set(rule.id);
  }

  protected cancelRemove(): void {
    this.pendingRemoval.set(null);
  }

  protected async remove(rule: OrderTimeLimitView): Promise<void> {
    this.pendingRemoval.set(null);
    try {
      await this.api.remove(rule.id);
      this.notify.success('Limite retirée — cet article suit de nouveau ce dont il hérite.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  /** Rien à dire quand la valeur vient de la portée qu'on regarde. */
  private origin(row: OrderLimitRow, from: OrderTimeLimitScopeType | undefined): string | null {
    if (from === undefined || from === row.scopeType) {
      return null;
    }
    return provenanceLabel(from);
  }
}
