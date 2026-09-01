import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { AllergenEntry, IngredientView } from '@lfd/pim-contracts';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldMultiselectComponent,
  FoldOptionComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectItem,
} from 'fold-ng';

import { LangSwitch } from '../../../shared/lang-switch/lang-switch';
import { localizedField } from '../../../shared/lang-switch/localized-field';
import { NotifyService } from '../../../notify.service';
import { ProvenanceStore } from '../provenance.store';

/** Charge passée à `open()` : l'ingrédient à régler. Absente = déclaration. */
export interface IngredientPanelData {
  readonly ingredient: IngredientView;
}

/** Ce que « pas d'appellation » vaut dans la liste — le vide n'est pas une option. */
const NO_APPELLATION = '';

/** Le seau des codes sans catégorie INCO — `BWD`, `NM`, `SO` au catalogue `world`. */
const OUTSIDE_EU = 'Hors obligation UE';

/**
 * Le seau des codes que l'ingrédient porte et que le référentiel ne propose
 * plus (une entrée archivée : elle sort de ce qu'on PROPOSE, jamais de ce qu'on
 * RECONNAÎT, D2 bis).
 *
 * Groupé même à un seul élément, contrairement aux catégories : ici la légende
 * n'est pas le libellé de l'entrée, elle dit pourquoi celle-ci est à part.
 */
const WITHDRAWN = 'Retiré du référentiel';

/**
 * Panneau **ingrédient** — déclaration ou réglage, plus la zone dangereuse.
 *
 * Le **nom** et la **description** se traduisent ; l'origine géographique non —
 * « Savoie, France » est un lieu, pas une phrase, et le traduire inventerait
 * trois façons de nommer le même endroit.
 *
 * L'appellation est **facultative** : la farine du moulin d'à côté n'a pas de
 * signe officiel, et l'obliger à en porter un fabriquerait des appellations
 * creuses pour satisfaire un champ.
 *
 * Les **allergènes** s'y posent aussi, en codes GS1 et au périmètre `world`
 * (D4). Ils partent par leur propre requête : le serveur les prend en un
 * `PUT …/allergens` qui remplace la liste entière, pas dans le corps de la
 * fiche.
 */
@Component({
  selector: 'app-ingredient-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldMultiselectComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    LangSwitch,
  ],
  templateUrl: './ingredient-panel.html',
  styleUrl: './ingredient-panel.scss',
})
export class IngredientPanel {
  private readonly store = inject(ProvenanceStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input<IngredientPanelData | undefined>(undefined);

  protected readonly ingredient = computed(() => this.data()?.ingredient);
  protected readonly isEdit = computed(() => this.ingredient() !== undefined);

  protected readonly draftKey = signal('');
  protected readonly draftOrigin = signal('');
  protected readonly draftAppellation = signal<string>(NO_APPELLATION);
  protected readonly draftAllergens = signal<readonly string[]>([]);
  protected readonly confirmKey = signal('');
  protected readonly busy = signal(false);
  protected readonly dangerOpen = signal(false);

  protected readonly name = localizedField({
    source: () => this.ingredient()?.name ?? { fr: '' },
    label: 'Nom',
    subject: 'Le nom',
  });

  protected readonly description = localizedField({
    source: () => this.ingredient()?.description ?? { fr: '' },
    label: 'Description',
    subject: 'La description',
  });

  protected readonly heading = computed(() =>
    this.isEdit() ? "Régler l'ingrédient" : 'Nouvel ingrédient',
  );

  /**
   * Les appellations qu'on peut POSER, plus « aucune ».
   *
   * Celles hors service en sont absentes — mais celle que l'ingrédient porte
   * DÉJÀ y reste, même retirée : sinon le panneau l'effacerait en silence au
   * premier enregistrement.
   */
  protected readonly appellationOptions = computed<{ value: string; text: string }[]>(() => {
    const held = this.ingredient()?.appellation ?? null;
    const offered = this.store.offeredAppellations();
    const all =
      held !== null && !offered.some((row) => row.code === held.code)
        ? [...offered, held]
        : offered;
    return [
      { value: NO_APPELLATION, text: 'Aucune appellation' },
      ...all.map((row) => ({
        value: row.code,
        text: row.scheme === '' ? row.label.fr : `${row.scheme} — ${row.label.fr}`,
      })),
    ];
  });

  protected readonly allergensLoading = this.store.allergensLoading;
  protected readonly allergenError = this.store.allergenError;

  /**
   * Le référentiel rangé par CATÉGORIE, prêt pour l'API `[options]`.
   *
   * **On groupe une catégorie qui a plus d'une entrée, on aplatit celle qui n'en
   * a qu'une.** Les douze catégories INCO à entrée unique portent un libellé
   * identique à leur entrée — « Céleri » sous « Céleri » — et un groupe d'un
   * seul élément y serait une redondance visible. Sur le catalogue `world`,
   * seules `gluten` (7), `tree_nuts` (8) et « Hors obligation UE » (3) se
   * groupent. C'est la règle que la fiche réglementaire applique déjà.
   *
   * Une catégorie aplatie prend le libellé **réglementaire** (« Anhydride
   * sulfureux et sulfites »), pas le granulaire : c'est lui qui figure sur
   * l'étiquette. Dans un groupe, au contraire, c'est le granulaire qui compte —
   * la légende porte déjà la catégorie.
   *
   * 🔴 **Toutes les options simples d'abord, tous les groupes ensuite**, et
   * jamais l'inverse. Un groupe ne se FERME pas : fold rend « each group's
   * options under its label », donc une option simple qui suit un en-tête se
   * dessine au même niveau que les membres du groupe et se lit comme l'un
   * d'eux — « Crustacés » passait pour une céréale contenant du gluten. Rien
   * dans `[options]` ne permet de refermer un groupe ; l'ordre est la seule
   * parade.
   *
   * Ce que ça coûte : l'ordre canonique de l'annexe II est rompu au niveau
   * global (le gluten y est premier, il arrive ici après les simples). Il
   * n'était promis à personne, aucun lecteur n'en dépend, et la lisibilité
   * prime. À l'intérieur de chaque bloc, l'ordre du référentiel est conservé.
   */
  protected readonly allergenOptions = computed<readonly FoldSelectItem<string>[]>(() => {
    const buckets = new Map<string, AllergenEntry[]>();
    for (const entry of this.store.allergenEntries()) {
      const bucket = buckets.get(entry.incoLabel ?? OUTSIDE_EU);
      if (bucket === undefined) {
        buckets.set(entry.incoLabel ?? OUTSIDE_EU, [entry]);
      } else {
        bucket.push(entry);
      }
    }

    const loose: FoldSelectItem<string>[] = [];
    const grouped: FoldSelectItem<string>[] = [];
    for (const [label, entries] of buckets) {
      if (entries.length > 1) {
        grouped.push({
          label,
          options: entries.map((entry) => ({ value: entry.code, label: entry.label })),
        });
        continue;
      }
      for (const entry of entries) {
        loose.push({ value: entry.code, label: entry.incoLabel ?? entry.label });
      }
    }

    const withdrawn = this.withdrawnCodes();
    if (withdrawn.length > 0) {
      // En dernier, après les catégories : ce n'en est pas une, et ce qui n'est
      // plus proposé n'a pas à couper la liste de ce qui l'est.
      grouped.push({
        label: WITHDRAWN,
        options: withdrawn.map((code) => ({ value: code, label: code })),
      });
    }
    return [...loose, ...grouped];
  });

  /**
   * Les codes cochés que le référentiel ne propose plus.
   *
   * Sans eux dans `[options]`, le contrôle les garderait dans sa valeur sans les
   * montrer : le résumé du déclencheur mentirait sur ce qui est posé, et
   * personne ne pourrait les décocher. On les affiche donc sous leur code brut —
   * on n'a plus leur libellé, et en inventer un serait pire que le code.
   */
  private readonly withdrawnCodes = computed<readonly string[]>(() => {
    const offered = new Set(this.store.allergenEntries().map((entry) => entry.code));
    return this.draftAllergens().filter((code) => !offered.has(code));
  });

  /** Rien à envoyer si rien n'a bougé — l'ordre ne compte pas, c'est un ensemble. */
  private readonly allergensChanged = computed(() => {
    const held = [...(this.ingredient()?.allergens ?? [])].sort();
    const draft = [...this.draftAllergens()].sort();
    return held.length !== draft.length || held.some((code, index) => code !== draft[index]);
  });

  protected readonly held = computed(() => this.ingredient()?.usedBy ?? 0);

  protected readonly confirmMatches = computed(
    () => this.confirmKey().trim() === (this.ingredient()?.key ?? ' '),
  );

  protected readonly canDelete = computed(
    () => this.held() === 0 && this.confirmMatches() && !this.busy(),
  );

  constructor() {
    // Le référentiel n'est lu qu'ici : c'est le seul écran qui pose des codes
    // sur une matière. L'échec est retenu par le magasin, pas avalé.
    void this.store.ensureAllergens().catch(() => undefined);

    effect(() => {
      const target = this.ingredient();
      if (target !== undefined) {
        this.draftKey.set(target.key);
        this.draftOrigin.set(target.origin);
        this.draftAppellation.set(target.appellation?.code ?? NO_APPELLATION);
        this.draftAllergens.set([...target.allergens]);
      }
    });
  }

  protected get canSubmit(): boolean {
    return this.draftKey().trim() !== '' && this.name.filled() && !this.busy();
  }

  /** `valueChange` rend `null` quand rien n'est choisi — ce qui EST « aucune ». */
  protected pickAppellation(value: string | null): void {
    this.draftAppellation.set(value ?? NO_APPELLATION);
  }

  protected async submit(): Promise<void> {
    await this.run(() => this.persist());
  }

  protected async remove(): Promise<void> {
    const target = this.ingredient();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.removeIngredient(target.key));
  }

  /** Le référentiel n'est pas venu : on redemande, sans quitter la saisie. */
  protected retryAllergens(): void {
    void this.store.ensureAllergens().catch(() => undefined);
  }

  protected toggleDanger(): void {
    this.dangerOpen.update((open) => !open);
  }

  protected cancel(): void {
    this.ref.close();
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.ref.close(true);
    } catch (caught) {
      this.notify.refused(caught, 'Opération refusée.');
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Une description vidée part en `null` : le serveur en fait une absence, et
   * une absence n'est pas un texte vide — c'est ce que le référentiel compte
   * comme « personne n'a écrit ».
   *
   * Les allergènes partent **après**, et par leur propre route : ce sont deux
   * écritures côté serveur, pas un champ de la fiche. À la déclaration, la liste
   * vide ne provoque aucun appel — `[]` sur une matière n'affirme rien, il n'y a
   * donc rien à poser.
   */
  private async persist(): Promise<void> {
    const appellationCode =
      this.draftAppellation() === NO_APPELLATION ? null : this.draftAppellation();
    const description = this.description.filled() ? this.description.text() : null;
    const target = this.ingredient();

    if (target === undefined) {
      const key = this.draftKey().trim();
      await this.store.createIngredient({
        key,
        name: this.name.text(),
        description,
        origin: this.draftOrigin().trim(),
        appellationCode,
      });
      if (this.draftAllergens().length > 0) {
        await this.store.setIngredientAllergens(key, this.draftAllergens());
      }
      return;
    }
    await this.store.updateIngredient(target.key, {
      name: this.name.text(),
      description,
      origin: this.draftOrigin().trim(),
      appellationCode,
    });
    if (this.allergensChanged()) {
      await this.store.setIngredientAllergens(target.key, this.draftAllergens());
    }
  }
}
