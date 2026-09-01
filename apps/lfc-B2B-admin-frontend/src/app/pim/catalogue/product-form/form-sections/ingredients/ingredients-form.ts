import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldOptionComponent,
} from 'fold-ng';

import { ProvenanceStore } from '../../../../provenance/provenance.store';
import { ProductFormStore } from '../../product-form-store';
import { ProductIngredientsStore } from './product-ingredients.store';

/** Le vide de la liste déroulante — « choisir un ingrédient » n'est pas une valeur. */
const NONE = '';

/**
 * Section **Ingrédients** de la fiche — d'où vient ce qu'il y a dedans.
 *
 * ⚠️ Sous les allergènes, et volontairement PAS avec eux : la liste
 * réglementaire au sens du règlement 1169/2011 est ordonnée par masse, porte
 * des quantités et appartient à la déclinaison. Celle-ci est éditoriale — un
 * badge, un argument de vente — et son ordre est une décision, pas une mesure.
 *
 * Elle est **entièrement facultative** : une fiche sans ingrédient reste
 * publiable. La complétude mesure ce qui est obligatoire pour vendre, et un
 * argument de provenance n'en fait pas partie — l'y compter bloquerait tout le
 * catalogue existant sur un champ que personne n'a demandé.
 *
 * Elle porte son propre bouton d'enregistrement, parce qu'elle vit sur un autre
 * agrégat que le reste du formulaire : « Tout enregistrer » n'a jamais porté
 * cette liste, et le laisser croire serait pire que de l'afficher à part.
 */
@Component({
  selector: 'app-ingredients-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProductIngredientsStore],
  imports: [
    FoldListboxComponent,
    FoldOptionComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldIconComponent,
  ],
  templateUrl: './ingredients-form.html',
  styleUrl: './ingredients-form.scss',
})
export class IngredientsForm {
  private readonly form = inject(ProductFormStore);
  private readonly provenance = inject(ProvenanceStore);
  protected readonly store = inject(ProductIngredientsStore);

  protected readonly picked = signal<string>(NONE);

  /** La fiche n'existe pas encore : rien à citer tant qu'elle n'est pas créée. */
  protected readonly isNew = computed(() => this.form.productId() === '');

  /** Le détail des ingrédients cités, dans l'ordre du brouillon. */
  protected readonly rows = computed(() => {
    const known = new Map(this.provenance.ingredients().map((row) => [row.key, row]));
    // Le magasin de la fiche connaît aussi ceux qu'elle citait au chargement :
    // un ingrédient retiré du référentiel entre-temps doit rester affichable,
    // sinon la ligne disparaîtrait sans qu'on puisse la retirer.
    for (const row of this.store.cited()) {
      if (!known.has(row.key)) {
        known.set(row.key, row);
      }
    }
    return this.store
      .keys()
      .map((key) => known.get(key))
      .filter((row) => row !== undefined);
  });

  /** Ce qu'on peut encore ajouter — jamais deux fois le même. */
  protected readonly addable = computed(() => {
    const already = new Set(this.store.keys());
    return this.provenance.ingredients().filter((row) => !already.has(row.key));
  });

  constructor() {
    effect(() => {
      void this.store.load(this.form.productId()).catch(() => undefined);
    });
  }

  /** « AOP — Beaufort », ou rien quand l'ingrédient ne porte pas de signe. */
  protected appellationLabel(row: {
    appellation: { scheme: string; label: { fr: string } } | null;
  }): string {
    const held = row.appellation;
    if (held === null) {
      return '';
    }
    return held.scheme === '' ? held.label.fr : `${held.scheme} — ${held.label.fr}`;
  }

  /** `valueChange` rend `null` quand rien n'est choisi — c'est le vide de la liste. */
  protected pick(value: string | null): void {
    this.picked.set(value ?? NONE);
  }

  protected add(): void {
    const key = this.picked();
    if (key !== NONE) {
      this.store.add(key);
      this.picked.set(NONE);
    }
  }

  /**
   * Enregistre la composition, puis prévient le reste de la fiche.
   *
   * Les deux vivent sur des agrégats différents, et c'est bien ainsi — mais
   * l'une MENTIONNE des allergènes que l'autre déclare. Sans ce rappel, ajouter
   * « beurre » ici ne changerait rien à ce que la déclaration propose tant
   * qu'on n'a pas rechargé la page, et l'écran resterait muet exactement là où
   * il doit parler (audit 2026-09-01, §3).
   */
  protected async save(): Promise<void> {
    await this.store.save(this.form.productId()).catch(() => undefined);
    await this.form.noteCompositionSaved();
  }
}
