import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { OrderTimeLimitPayload, OrderTimeLimitView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldListboxComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectOption,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { CategoryStore } from '../../catalogue/category-store';
import { ProductListStore } from '../../catalogue/product-list-store';
import { OrderTimeLimitsService } from '../order-time-limits.service';
import { daysPhrase } from '../limit-format';

/** Les deux portées que le référentiel pose : un produit, ou une famille. */
export type LimitScopeType = 'product' | 'category';

/** La cible d'une limite. */
export interface LimitScope {
  readonly type: LimitScopeType;
  readonly id: string;
}

/**
 * Charge d'ouverture.
 *
 * - `scope` connu (fiche produit, fiche famille, « Modifier ») : le panneau
 *   pose sur cette cible ;
 * - `scope: null` (« Poser une limite » de la page des limites) : le panneau
 *   fait choisir la portée puis la cible, et cherche dans `known` la limite
 *   déjà posée sur cette cible — archivée comprise, pour dire ce qu'elle
 *   remettra en vigueur.
 */
export interface LimitPanelData {
  readonly scope: LimitScope | null;
  /** Le nom de la cible, pour l'en-tête ; ignoré quand on la choisit ici. */
  readonly label: string;
  readonly rule: OrderTimeLimitView | null;
  readonly known?: readonly OrderTimeLimitView[];
}

const SCOPE_CHOICES: FoldSelectOption<LimitScopeType>[] = [
  { value: 'product', label: 'Un produit' },
  { value: 'category', label: 'Une famille' },
];

/** Les délais proposés. Pas d'entrée « hériter » : il n'y a plus de rang au-dessus. */
const DAYS_CHOICES: FoldSelectOption<string>[] = [0, 1, 2, 3, 7].map((days) => ({
  value: String(days),
  label: days === 7 ? 'Une semaine avant' : daysPhrase(days),
}));

/**
 * Panneau **Limite de commande** — pose ou modifie la limite d'un produit ou
 * d'une famille.
 *
 * Une limite est une **règle entière** — le délai ET l'heure — et **sans
 * rattrapage** : le seul rattrapage est celui de la règle générale (Réglages ›
 * Commandes › Heure limite). Pas de « toute la production » ici, pas de
 * déclinaison : une déclinaison suit son produit. Une limite de famille vise
 * toute sa descendance, sauf les produits qu'elle exclut.
 *
 * Reposer une limite de famille archivée remet en vigueur ses exclusions : le
 * panneau le dit avant qu'on valide.
 */
@Component({
  selector: 'app-limit-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldListboxComponent,
  ],
  templateUrl: './limit-panel.html',
})
export class LimitPanel {
  private readonly api = inject(OrderTimeLimitsService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);
  private readonly categories = inject(CategoryStore);
  private readonly products = inject(ProductListStore);

  readonly data = input<LimitPanelData | undefined>(undefined);

  protected readonly daysChoices = DAYS_CHOICES;
  protected readonly scopeChoices = SCOPE_CHOICES;
  /** La portée choisie ici, quand l'ouverture ne l'a pas fixée. */
  protected readonly pickedType = signal<LimitScopeType>('category');
  protected readonly pickedId = signal<string | null>(null);
  /** La cible est-elle à choisir dans le panneau ? */
  protected readonly picking = computed(() => (this.data()?.scope ?? null) === null);

  /** Les familles en vigueur, par nom. */
  protected readonly familyChoices = computed<FoldSelectOption<string>[]>(() =>
    this.categories
      .items()
      .filter((family) => !family.isArchived)
      .map((family) => ({ value: family.id, label: family.name.fr ?? family.id }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
  );

  /** Les produits, par nom, le SKU à côté : deux fiches peuvent porter le même nom. */
  protected readonly productChoices = computed<FoldSelectOption<string>[]>(() =>
    this.products
      .products()
      .map((product) => ({
        value: product.id,
        label: `${product.name.fr ?? product.sku} — ${product.sku}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
  );

  /** La cible visée : fixée à l'ouverture, ou choisie ici. */
  protected readonly scope = computed<LimitScope | null>(() => {
    const fixed = this.data()?.scope ?? null;
    if (fixed !== null) {
      return fixed;
    }
    const id = this.pickedId();
    return id === null ? null : { type: this.pickedType(), id };
  });

  /**
   * La limite déjà posée sur la cible, archivée comprise : celle de
   * l'ouverture, ou celle que la liste connaît pour la cible choisie.
   */
  protected readonly existing = computed<OrderTimeLimitView | null>(() => {
    const data = this.data();
    if (data?.rule !== undefined && data.rule !== null) {
      return data.rule;
    }
    const scope = this.scope();
    if (scope === null) {
      return null;
    }
    return (
      (data?.known ?? []).find(
        (rule) => rule.scope.type === scope.type && rule.scope.id === scope.id,
      ) ?? null
    );
  });

  /**
   * Reposer une limite de famille archivée remet ses exclusions en vigueur :
   * le nombre à dire avant validation, ou `null`.
   */
  protected readonly reinstatedExclusions = computed(() => {
    const rule = this.existing();
    if (rule === null || !rule.archived || rule.scope.type !== 'category') {
      return null;
    }
    const count = rule.excludedProductIds.length;
    if (count === 0) {
      return null;
    }
    return count === 1 ? '1 produit reste exclu' : `${count} produits restent exclus`;
  });

  /** « S'applique à … » : la portée en clair. */
  protected readonly reach = computed(() => {
    const scope = this.scope();
    const label = this.label();
    if (scope === null) {
      return null;
    }
    return scope.type === 'category'
      ? { label, rest: ', à ses sous-familles et à tous leurs produits, sauf les produits exclus.' }
      : { label, rest: ', et à toutes ses déclinaisons.' };
  });
  protected readonly daysBefore = signal<string>('1');
  protected readonly time = signal<string>('');
  /** L'équipe peut passer outre. Décochée par défaut : une limite neuve est infranchissable. */
  protected readonly staffMayExceed = signal(false);
  protected readonly saving = signal(false);

  protected readonly label = computed(() => {
    const data = this.data();
    if (data === undefined) {
      return '';
    }
    if (data.scope !== null) {
      return data.label;
    }
    const id = this.pickedId();
    const choices = this.pickedType() === 'category' ? this.familyChoices() : this.productChoices();
    return choices.find((choice) => choice.value === id)?.label ?? '';
  });
  /** Une limite EN VIGUEUR se modifie ; une archivée ou absente se pose. */
  protected readonly isCreate = computed(() => {
    const rule = this.existing();
    return rule === null || rule.archived;
  });
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle limite de commande' : 'Modifier la limite',
  );

  /** Le délai ET l'heure : une limite qui n'en dit qu'un ne refuserait rien. */
  protected readonly canSubmit = computed(
    () => this.scope() !== null && this.time().trim() !== '' && !this.saving(),
  );

  protected readonly recap = computed(() =>
    this.time().trim() === ''
      ? "Renseignez l'heure : une limite dit le délai et l'heure."
      : `Commander au plus tard ${daysPhrase(Number(this.daysBefore())).toLowerCase()}, avant ${this.time()}. Passé cette heure, la commande est refusée.`,
  );

  constructor() {
    // Les listes de choix ne se chargent que si l'on choisit ici. `untracked` :
    // l'état du chargement ne doit pas relancer l'effet, sans quoi un échec
    // relirait en boucle.
    effect(() => {
      if (this.data() !== undefined && this.picking()) {
        untracked(() => {
          void this.categories.ensure().catch(() => undefined);
          void this.products.open();
        });
      }
    });
    // Les valeurs de la limite déjà posée sur la cible, archivée comprise :
    // la reposer part de ce qu'elle disait.
    effect(() => {
      const rule = this.existing();
      if (rule === null) {
        return;
      }
      this.daysBefore.set(String(rule.daysBefore ?? 1));
      this.time.set(rule.time ?? '');
      this.staffMayExceed.set(rule.staffMayExceed);
    });
  }

  protected onScopeType(value: LimitScopeType): void {
    this.pickedType.set(value);
    this.pickedId.set(null);
  }

  protected onTarget(value: string | null): void {
    this.pickedId.set(value);
  }

  protected onDays(value: string): void {
    this.daysBefore.set(value);
  }

  protected onTime(event: Event): void {
    this.time.set((event.target as HTMLInputElement).value);
  }

  protected async submit(): Promise<void> {
    const scope = this.scope();
    if (!this.canSubmit() || scope === null) {
      return;
    }
    this.saving.set(true);
    const payload: OrderTimeLimitPayload = {
      scope: { type: scope.type, id: scope.id },
      daysBefore: Number(this.daysBefore()),
      time: this.time(),
      graceMinutes: null,
      staffMayExceed: this.staffMayExceed(),
    };
    try {
      await this.api.set(payload);
      this.notify.success('Limite enregistrée.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
