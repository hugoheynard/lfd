import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import type { IngredientAllergenPropagationView } from '@lfd/pim-contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import {
  appliedProductCount,
  propagationMessage,
  type AllergenLabeler,
  type IngredientAllergenChange,
} from '../allergen-propagation';
import { IngredientHttpApi } from '../ingredient-http-api';
import { IngredientPropagationPanel } from '../ingredient-propagation-panel/ingredient-propagation-panel';
import { ProvenanceStore } from '../provenance.store';

const NO_KEPT: ReadonlySet<string> = new Set();

/**
 * **Propager l'allergène d'un ingrédient à ses fiches** — le bandeau qui suit
 * l'enregistrement (plan `pim/plan-propager-allergenes-d-un-ingredient.md`, § 4).
 *
 * Il lit l'aperçu du serveur pour le diff reçu, dit le message chiffré, ouvre
 * le détail, et applique. Rien ne s'applique sans le clic (D5). Muet tant que
 * l'aperçu ne touche aucune fiche.
 */
@Component({
  selector: 'app-ingredient-propagation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './ingredient-propagation.html',
})
export class IngredientPropagation {
  private readonly api = inject(IngredientHttpApi);
  private readonly store = inject(ProvenanceStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  readonly change = input.required<IngredientAllergenChange>();
  /** Appliqué ou écarté : la page peut oublier le diff. */
  readonly settled = output();

  protected readonly view = signal<IngredientAllergenPropagationView | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly applyError = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** Les libellés du référentiel déjà lu par le panneau d'ingrédient ; le code sinon. */
  private readonly labelOf: AllergenLabeler = (code) =>
    this.store.allergenEntries().find((entry) => entry.code === code)?.label ?? code;

  protected readonly message = computed(() => {
    const view = this.view();
    return view === null ? '' : propagationMessage(view, this.labelOf);
  });

  protected readonly count = computed(() => {
    const view = this.view();
    return view === null ? 0 : appliedProductCount(view, NO_KEPT);
  });

  protected readonly applyLabel = computed(() =>
    this.count() === 1 ? 'Appliquer à 1 fiche' : `Appliquer à ${String(this.count())} fiches`,
  );

  constructor() {
    effect(() => {
      void this.load(this.change());
    });
  }

  protected retry(): void {
    void this.load(this.change());
  }

  protected dismiss(): void {
    this.settled.emit();
  }

  protected showProducts(): void {
    const view = this.view();
    if (view === null) {
      return;
    }
    const ref = this.panels.open<
      { view: IngredientAllergenPropagationView; labelOf: AllergenLabeler },
      number
    >(IngredientPropagationPanel, { data: { view, labelOf: this.labelOf } });
    void ref.closed.then((applied) => {
      if (applied !== undefined) {
        this.done(applied);
      }
    });
  }

  /** Tout ce qui est proposé, retraits compris (cases cochées par défaut). */
  protected async applyAll(): Promise<void> {
    const view = this.view();
    if (view === null || this.count() === 0) {
      return;
    }
    const applied = this.count();
    this.busy.set(true);
    this.applyError.set(null);
    try {
      await this.api.applyAllergenPropagation(view.ingredientKey, {
        added: [...view.added],
        removed: [...view.removed],
      });
      this.done(applied);
    } catch (caught) {
      this.applyError.set(httpErrorMessage(caught, 'La propagation a été refusée.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * La table des produits relit ses constats de conformité à chaque ouverture
   * (`ProductsPage.reload`, vérifié le 2026-10-27) : rien à invalider ici.
   */
  private done(applied: number): void {
    this.notify.success(
      applied === 1 ? '1 fiche mise à jour' : `${String(applied)} fiches mises à jour`,
    );
    this.settled.emit();
  }

  private async load(change: IngredientAllergenChange): Promise<void> {
    this.view.set(null);
    this.loadError.set(null);
    this.applyError.set(null);
    try {
      await this.store.ensureAllergens().catch(() => undefined);
      this.view.set(await this.api.allergenPropagation(change.key, change.added, change.removed));
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, "L'aperçu des fiches n'a pas pu être lu."));
    }
  }
}
