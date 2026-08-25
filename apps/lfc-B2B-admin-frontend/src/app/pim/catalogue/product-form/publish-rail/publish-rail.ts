import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldChecklistComponent,
  FoldElementTitleComponent,
  FoldMeterComponent,
  type FoldChecklistItem,
  type FoldChecklistState,
  type FoldMeterTone,
} from 'fold-ng';
import { LOCALES, SOURCE_LOCALE, type Locale, type LocalizedText } from '@lfd/pim-contracts';

import { LOCALE_NAMES } from '../../../../shared/lang-switch/locale-names';
import { ProductFormStore } from '../product-form-store';

/** Une ligne requise et les facultatives qu'elle porte. */
interface RequiredCheck {
  readonly item: FoldChecklistItem;
  readonly children: readonly FoldChecklistItem[];
}

/** Les langues à traduire — toutes sauf la source, qui n'est pas une traduction. */
const TRANSLATED: readonly Locale[] = LOCALES.filter((locale) => locale !== SOURCE_LOCALE);

/** Ce qu'un lecteur d'écran entend avant le libellé. La librairie livre l'anglais. */
const STATE_LABELS: Readonly<Record<FoldChecklistState, string>> = {
  done: 'Fait',
  todo: 'À faire',
  optional: 'Facultatif',
};

/**
 * Les traductions d'un texte, une ligne par langue — **sous** la ligne du champ
 * qu'elles traduisent.
 *
 * Rien tant que la source est vide : un champ qu'on n'a pas encore écrit ne
 * « manque » dans aucune langue, et afficher « Nom · anglais » sur une fiche
 * neuve remplirait la complétude de gris avant qu'on ait tapé un caractère.
 * C'est la règle que le store applique déjà pour le point ambre du sélecteur
 * de langue (`editorialMissing`), et elle vaut ici pour la même raison.
 */
function translations(subject: string, text: LocalizedText | null): readonly FoldChecklistItem[] {
  if ((text?.[SOURCE_LOCALE] ?? '').trim() === '') {
    return [];
  }
  return TRANSLATED.map((locale) => ({
    label: `${subject} · ${LOCALE_NAMES[locale]}`,
    state: (text?.[locale] ?? '').trim() === '' ? 'optional' : 'done',
  }));
}

/**
 * Le rail collant : ce qui reste en attente, et ce qui manque.
 *
 * « Tout enregistrer » remplace l'avertissement au départ. Il n'y a plus de
 * raison de quitter la page sans avoir vu ce qui est en attente, puisque c'est
 * affiché en permanence à hauteur d'œil — un geste pour l'utilisateur, N appels
 * pour l'API, et les échecs restent indépendants (une section qui échoue reste
 * marquée « Modifié », les autres passent).
 *
 * ## Ce qui bloque, et ce qui ne bloque pas
 *
 * Deux natures dans la même liste, et le `fold-meter` ne mesure que la
 * première : les lignes **requises** (nom, prix, allergènes, description,
 * visuel) et les lignes **facultatives** (les traductions). Compter les
 * traductions dans la barre ferait d'une fiche parfaitement publiable une fiche
 * à 5/9 : la barre annoncerait un manque là où il n'y en a pas. Elles se
 * voient, elles ne pèsent pas.
 *
 * Les traductions sont posées **juste après** le champ qu'elles traduisent, et
 * leur libellé le redit (`Nom · anglais`). `fold-checklist` est une liste
 * plate : le lien parent-enfant passe par l'ordre et par le libellé, pas par
 * une indentation. Un vrai niveau demanderait un `children` dans
 * `FoldChecklistItem`, donc une évolution de fold-ng — au deuxième usage réel,
 * pas pour celui-ci.
 *
 * La complétude reste **partielle** : elle ne liste que ce que le modèle sait.
 * Le poids brut d'un conditionnement, présent sur la maquette, n'y est pas —
 * les conditionnements n'existent pas encore. Une case qui ne mesure rien est
 * pire qu'une case absente.
 */
@Component({
  selector: 'app-publish-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldChecklistComponent,
    FoldElementTitleComponent,
    FoldMeterComponent,
  ],
  templateUrl: './publish-rail.html',
  styleUrl: './publish-rail.scss',
})
export class PublishRail {
  protected readonly store = inject(ProductFormStore);

  /** Lance l'enregistrement de toutes les sections modifiées. */
  readonly saveAll = output<void>();

  protected readonly stateLabels = STATE_LABELS;

  /**
   * Ce qui bloque la publication, chacun avec ses sous-lignes.
   *
   * Les enfants sont attachés à leur parent ICI, à la construction, plutôt que
   * rapprochés après coup par leur libellé : un rattachement par chaîne se
   * casse au premier renommage de libellé, et il se casse en silence — la
   * sous-ligne disparaît, la barre reste juste.
   */
  protected readonly required = computed<readonly RequiredCheck[]>(() => [
    {
      item: { label: 'Nom et famille', state: state(this.store.isValid()) },
      children: translations('Nom', this.store.nameText()),
    },
    { item: { label: 'Prix', state: state(this.store.priceEur() !== null) }, children: [] },
    {
      item: {
        label: 'Allergènes déclarés',
        state: state(this.store.declaresNone() || this.store.selected().length > 0),
      },
      children: [],
    },
    {
      item: {
        // La SOURCE fait foi : une fiche est publiable en français. Les
        // traductions sont dans la liste juste en dessous, facultatives.
        label: 'Description',
        state: state(
          (this.store.editorial().descriptionShort?.[SOURCE_LOCALE] ?? '').trim() !== '',
        ),
      },
      children: translations('Description', this.store.editorial().descriptionShort),
    },
    {
      item: { label: 'Au moins un visuel', state: state(this.store.media().length > 0) },
      children: [],
    },
  ]);

  /** La liste lue à l'écran : chaque requis, suivi de ses traductions. */
  protected readonly items = computed<readonly FoldChecklistItem[]>(() =>
    this.required().flatMap((check) => [check.item, ...check.children]),
  );

  /** Combien de requis sont satisfaits — la valeur de la barre. */
  protected readonly done = computed(
    () => this.required().filter((check) => check.item.state === 'done').length,
  );

  /**
   * Vert une fois tout rempli, accent avant.
   *
   * Pas d'ambre pour « incomplet » : une fiche en cours de saisie n'est pas en
   * faute, et une barre orange dès le premier champ apprend à ignorer la
   * couleur. L'alerte reste pour ce qui est vraiment anormal.
   */
  protected readonly tone = computed<FoldMeterTone>(() =>
    this.done() === this.required().length ? 'success' : 'accent',
  );
}

/** Une condition satisfaite ou non — jamais `optional` : ces lignes-là bloquent. */
function state(done: boolean): FoldChecklistState {
  return done ? 'done' : 'todo';
}
