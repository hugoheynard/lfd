import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldChecklistComponent,
  FoldInlineConfirmComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldMeterComponent,
  type FoldChecklistItem,
  type FoldChecklistState,
  type FoldMeterTone,
} from 'fold-ng';

import { B2bDelivery } from '../b2b-delivery/b2b-delivery';
import { ProductFormStore } from '../product-form-store';
import { completenessOf, measure, type CompletenessCheck } from './completeness';

/** Une exigence prête à peindre : sa ligne, et le détail qu'elle replie. */
interface CheckRow {
  readonly key: string;
  /**
   * La ligne de l'exigence — un tableau d'UN élément, parce qu'elle est rendue
   * par `fold-checklist` comme ses enfants. C'est le seul moyen que le glyphe du
   * parent soit le même que celui des enfants : la table état → icône vit dans
   * la librairie et n'en sort pas, donc la redessiner ici la ferait diverger au
   * premier changement de fold-ng, en silence.
   *
   * Un tableau construit ICI et pas dans le gabarit : `[items]="[row.item]"`
   * fabriquerait une référence neuve à chaque cycle de détection.
   */
  readonly items: readonly FoldChecklistItem[];
  readonly children: readonly FoldChecklistItem[];
  readonly doneChildren: number;
}

/**
 * La date d'une signature, telle qu'on la lit. Avec l'heure : deux
 * enregistrements dans la même journée sont le cas COURANT, et une date seule
 * ne dirait pas lequel des deux la signature a précédé.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
});

/** Ce qu'un lecteur d'écran entend avant le libellé. La librairie livre l'anglais. */
const STATE_LABELS: Readonly<Record<FoldChecklistState, string>> = {
  done: 'Fait',
  todo: 'À faire',
  optional: 'Facultatif',
};

/**
 * Le rail collant : ce qui reste en attente, et ce qui manque.
 *
 * « Tout enregistrer » remplace l'avertissement au départ. Il n'y a plus de
 * raison de quitter la page sans avoir vu ce qui est en attente, puisque c'est
 * affiché en permanence à hauteur d'œil — un geste pour l'utilisateur, N appels
 * pour l'API, et les échecs restent indépendants (une section qui échoue reste
 * marquée « Modifié », les autres passent).
 *
 * ## Ce que la complétude dit maintenant
 *
 * **Tout est bloquant.** Il n'y a plus de lignes « facultatives » : une fiche
 * publiable est une fiche traduite dans toutes les langues du catalogue. Les
 * traductions pesaient auparavant zéro dans la barre — elles se voyaient sans
 * compter — et une fiche à 5/5, verte, pouvait partir en français seul.
 *
 * Les langues sont **repliées** derrière leur exigence, avec leur compte visible
 * (`1/3 langues`). Déplier est un geste ; savoir combien il manque n'en demande
 * aucun. Un rail qui listerait ses dix lignes à plat pour deux champs
 * traduisibles noierait le prix et le visuel au milieu des langues.
 *
 * Le modèle — quelles exigences, quelles langues, comment on compte — vit dans
 * `completeness.ts`. Ce composant ne fait que le peindre.
 *
 * ## Et le bloc « Publiable » en dessous
 *
 * La complétude mesure la FORME : dix conditions remplies. Elle ne dira jamais
 * que 10,00 € est le bon prix, ni que la description parle du bon produit —
 * c'est une responsabilité, et une responsabilité se prend, elle ne se calcule
 * pas. D'où un second bloc, et un second geste : quelqu'un signe.
 *
 * La signature ne se périme pas toute seule, elle se DATE. Si la fiche bouge
 * après, le bloc le dit au lieu d'effacer la signature en silence — savoir que
 * Untel avait validé avant la modification vaut mieux que ne plus rien savoir.
 */
@Component({
  selector: 'app-publish-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    B2bDelivery,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldChecklistComponent,
    FoldInlineConfirmComponent,
    FoldDisclosureComponent,
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

  /**
   * Le cycle de vie de la fiche — remonté ici depuis le menu ⋮ de l'en-tête.
   *
   * Des `output` et non des appels directs au store : la page possède déjà ces
   * gestes (elle les enchaîne avec sa navigation et ses messages), et le rail
   * n'a pas à savoir ce qui suit un archivage.
   */
  readonly publish = output<void>();
  readonly unpublish = output<void>();
  readonly archive = output<void>();
  readonly restore = output<void>();

  protected readonly stateLabels = STATE_LABELS;

  /** Ce qui bloque la publication, tel que le modèle le dit. */
  protected readonly checks = computed<readonly CompletenessCheck[]>(() =>
    completenessOf({
      name: this.store.nameText(),
      categoryId: this.store.categoryId(),
      priceSet: this.store.priceEur() !== null,
      allergensDeclared: this.store.declaresNone() || this.store.selected().length > 0,
      description: this.store.editorial().descriptionShort ?? null,
      mediaCount: this.store.media().length,
    }),
  );

  /** Les mêmes exigences, en lignes de checklist. */
  protected readonly rows = computed<readonly CheckRow[]>(() =>
    this.checks().map((check) => ({
      key: check.key,
      items: [{ label: check.label, state: state(check.done) }],
      children: check.children.map((child) => ({
        label: child.label,
        state: state(child.done),
      })),
      doneChildren: check.children.filter((child) => child.done).length,
    })),
  );

  private readonly score = computed(() => measure(this.checks()));

  protected readonly done = computed(() => this.score().done);
  protected readonly total = computed(() => this.score().total);

  /**
   * Reste-t-il quelque chose à remplir ? La déclaration attend que non.
   *
   * Elle n'est pas *interdite* sur une fiche incomplète par principe : elle est
   * sans objet. Signer « les informations sont justes » quand il manque le prix
   * signerait un vide.
   */
  protected readonly complete = computed(() => this.done() === this.total());

  /** Ce qui reste, dit en toutes lettres sous le bouton désarmé. */
  protected readonly remaining = computed(() => this.total() - this.done());

  /**
   * La fiche se contredit-elle elle-même ?
   *
   * « Aucun allergène » coché sur une fiche dont la composition cite un
   * ingrédient qui en porte un. La complétude ne peut pas le voir : elle compte
   * « Allergènes déclarés » comme satisfait dès qu'une affirmation existe, et
   * celle-ci en est une — fausse, mais présente. La fiche était donc 10/10, et
   * signable, l'avertissement affiché juste au-dessus.
   */
  protected readonly contradicted = computed(() => this.store.citedContradictsNone());

  /**
   * Ce qui empêche de signer — la forme incomplète, ou la fiche qui se dément.
   *
   * 🔴 Ça retient la SIGNATURE, jamais la mise en vente, et la nuance est tout
   * le contrat de `ProductIngredientAllergensView` (D5) : la composition est une
   * aide de saisie, elle n'a **aucune valeur de contrôle** sur la déclaration
   * réglementaire. En faire une condition de publication la transformerait en
   * juge de ce qu'elle n'a pas qualité pour juger — une liste éditoriale cite
   * « le beurre de Savoie AOP » et tait la farine.
   *
   * Refuser la signature est autre chose : signer, c'est affirmer que la fiche
   * est juste, et l'écran vient de montrer que deux de ses champs se
   * contredisent. Ça se lève des deux côtés — cocher l'allergène, ou retirer
   * l'ingrédient — donc la composition ne décide toujours rien.
   *
   * ⚠️ Et seulement la CONTRADICTION, pas la simple proposition. « Aucun
   * allergène » est une affirmation universelle qu'un seul allergène cité
   * dément. « Contient du gluten » est partielle : un lait cité ne la rend pas
   * fausse, il la complète — et bloquer là rendrait la composition obligatoire.
   */
  protected readonly signatureBlocked = computed(() => !this.complete() || this.contradicted());

  /** La signature, mise en français. `null` = personne ne s'est prononcé. */
  protected readonly signature = computed<string | null>(() => {
    const signed = this.store.readiness();
    return signed === null
      ? null
      : `Déclarée publiable le ${DATE_FORMAT.format(new Date(signed.readyAt))} par ${signed.readyBy}`;
  });

  /** Déclare la fiche publiable — le store porte le geste, le rail le déclenche. */
  protected declare(): void {
    void this.store.declareReady();
  }

  /**
   * Vert une fois tout rempli, accent avant.
   *
   * Pas d'ambre pour « incomplet » : une fiche en cours de saisie n'est pas en
   * faute, et une barre orange dès le premier champ apprend à ignorer la
   * couleur. L'alerte reste pour ce qui est vraiment anormal.
   */
  protected readonly tone = computed<FoldMeterTone>(() =>
    this.done() === this.total() ? 'success' : 'accent',
  );
}

/** Une condition satisfaite ou non — jamais `optional` : tout ici bloque. */
function state(done: boolean): FoldChecklistState {
  return done ? 'done' : 'todo';
}
