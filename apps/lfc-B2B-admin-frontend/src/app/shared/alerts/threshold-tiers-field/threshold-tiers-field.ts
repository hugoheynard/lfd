import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FoldButtonComponent, FoldInfoComponent, FoldNumberInputComponent } from 'fold-ng';
import type { AlertThresholdTier } from '@lfd/contracts';

/**
 * Un palier **en cours d'édition** : ses champs peuvent être vides.
 *
 * C'est toute la différence avec `AlertThresholdTier`, qui est un palier valide.
 * Sans cet état intermédiaire, effacer « 50 » pour taper « 15 » était impossible :
 * le champ se remplissait tout seul au premier caractère effacé.
 */
interface EditableTier {
  readonly upToQuantity: number | null;
  readonly thresholdPercent: number | null;
  /** Le palier ouvert (« au-delà ») n'a pas de borne à saisir. */
  readonly open: boolean;
}

/**
 * L'échelle des **paliers de seuil** : « jusqu'à N habituellement commandés,
 * alerter au-delà de X % d'écart ».
 *
 * Servie par les deux types qui comparent une quantité à une référence. Seule la
 * référence change — la moyenne du compte pour ce SKU, ou la médiane du produit —
 * et c'est `baselineLabel` qui la nomme.
 *
 * **On édite librement, on range à la sortie du champ.** Trier à chaque frappe
 * faisait sauter la ligne qu'on était en train d'éditer sous le curseur : au « 1 »
 * de « 15 », le palier passait devant son voisin. Le tri, les bornes et la
 * croissance stricte s'appliquent donc au `focusout`, une fois la saisie finie.
 */
@Component({
  selector: 'app-threshold-tiers-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldNumberInputComponent, FoldButtonComponent, FoldInfoComponent],
  templateUrl: './threshold-tiers-field.html',
  styleUrl: './threshold-tiers-field.scss',
})
export class ThresholdTiersField {
  readonly tiers = input.required<readonly AlertThresholdTier[]>();
  /** Comment s'appelle la référence sur laquelle le palier se choisit. */
  readonly baselineLabel = input('la norme');
  /** « Hausse » / « Baisse » — deux échelles cohabitent sur le même écran. */
  readonly scaleLabel = input('Écart');
  /**
   * Le plafond du seuil. 99 pour une **baisse** : elle ne peut pas dépasser
   * 100 % et n'atteint même jamais ce plafond, donc laisser saisir 200 %
   * fabriquerait une surveillance qui ne se déclenche jamais.
   */
  readonly maxPercent = input(5000);
  readonly disabled = input(false);
  readonly tiersChange = output<AlertThresholdTier[]>();

  /** Le brouillon, réaligné quand le parent rend une nouvelle échelle. */
  protected readonly draft = linkedSignal<readonly AlertThresholdTier[], EditableTier[]>({
    source: this.tiers,
    computation: (tiers) =>
      tiers.map((tier) => ({
        upToQuantity: tier.upToQuantity,
        thresholdPercent: tier.thresholdPercent,
        open: tier.upToQuantity === null,
      })),
  });

  /**
   * Compteur de reconstruction des lignes.
   *
   * Après normalisation, une valeur peut **revenir à ce qu'elle était** — un champ
   * vidé reprend sa valeur précédente. La valeur liée n'ayant alors pas changé,
   * Angular n'a rien à repousser et le champ resterait vide à l'écran alors que
   * la règle, elle, vaut 10. Changer la clé de suivi reconstruit la ligne, donc
   * l'écran montre ce qui sera réellement enregistré.
   */
  protected readonly revision = signal(0);

  protected readonly bounded = computed(() => this.draft().filter((tier) => !tier.open));
  protected readonly openTier = computed(() => this.draft().find((tier) => tier.open) ?? null);

  /** Écrit dans le brouillon **sans** ranger : on ne bouge pas sous le curseur. */
  protected setBound(index: number, value: number | null): void {
    this.draft.update((tiers) =>
      tiers.map((tier, i) => (i === index ? { ...tier, upToQuantity: value } : tier)),
    );
  }

  protected setPercent(index: number, value: number | null): void {
    this.draft.update((tiers) =>
      tiers.map((tier, i) => (i === index ? { ...tier, thresholdPercent: value } : tier)),
    );
  }

  /**
   * La saisie est finie : on borne, on range, on émet — et **seulement si** le
   * résultat diffère de ce qu'on a reçu. Un simple passage dans un champ ne doit
   * pas marquer la règle comme modifiée.
   */
  protected commit(): void {
    const normalised = normalise(this.draft(), this.tiers(), this.maxPercent());
    this.draft.set(normalised.map((tier) => ({ ...tier, open: tier.upToQuantity === null })));
    this.revision.update((count) => count + 1);
    if (!sameTiers(normalised, this.tiers())) {
      this.tiersChange.emit(normalised);
    }
  }

  /**
   * Ajoute un palier **avant** l'ouvert, une borne au-dessus du précédent et
   * bornée au maximum du schéma : un palier au-delà d'un million reviendrait en
   * 400 au moment d'enregistrer.
   */
  protected addTier(): void {
    const bounded = this.bounded();
    const previous = bounded[bounded.length - 1]?.upToQuantity ?? 0;
    const inserted: EditableTier = {
      upToQuantity: Math.min(MAX_QUANTITY, (previous ?? 0) + 10),
      thresholdPercent: this.openTier()?.thresholdPercent ?? 50,
      open: false,
    };
    this.draft.update((tiers) => [
      ...tiers.filter((t) => !t.open),
      inserted,
      ...tiers.filter((t) => t.open),
    ]);
    this.commit();
  }

  protected removeTier(index: number): void {
    this.draft.update((tiers) => tiers.filter((_, i) => i !== index));
    this.commit();
  }

  /** L'index d'un palier borné dans le brouillon complet — l'ouvert est à part. */
  protected indexOfBounded(position: number): number {
    return this.draft().findIndex((tier) => tier === this.bounded()[position]);
  }

  protected indexOfOpen(): number {
    return this.draft().findIndex((tier) => tier.open);
  }
}

const MAX_QUANTITY = 1_000_000;
const MIN_PERCENT = 5;

/**
 * Range une échelle éditée en une échelle **valide**.
 *
 * Un champ laissé vide reprend la valeur qu'il avait avant l'édition : effacer
 * puis quitter n'est pas une intention, c'est une hésitation. Les bornes égales
 * sont écartées d'une unité — le serveur exige une croissance stricte, et
 * découvrir cette règle par un 400 n'apprend rien à personne.
 */
function normalise(
  draft: readonly EditableTier[],
  committed: readonly AlertThresholdTier[],
  maxPercent: number,
): AlertThresholdTier[] {
  const bounded = draft
    .filter((tier) => !tier.open)
    .map((tier, index) => ({
      upToQuantity: clamp(
        tier.upToQuantity ?? committed[index]?.upToQuantity ?? 1,
        1,
        MAX_QUANTITY,
      ),
      thresholdPercent: percentOf(tier, committed[index], maxPercent),
    }))
    .sort((a, b) => a.upToQuantity - b.upToQuantity);

  const strict = bounded.map((tier, index, all) => {
    const previous = all[index - 1]?.upToQuantity;
    return previous !== undefined && tier.upToQuantity <= previous
      ? { ...tier, upToQuantity: Math.min(MAX_QUANTITY, previous + 1) }
      : tier;
  });

  const open = draft.find((tier) => tier.open);
  const last = committed[committed.length - 1];
  return [
    ...strict,
    {
      upToQuantity: null,
      thresholdPercent: percentOf(open, last, maxPercent),
    },
  ];
}

function percentOf(
  tier: EditableTier | undefined,
  fallback: AlertThresholdTier | undefined,
  maxPercent: number,
): number {
  const value = tier?.thresholdPercent ?? fallback?.thresholdPercent ?? MIN_PERCENT;
  return clamp(value, MIN_PERCENT, maxPercent);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Deux échelles identiques ? Sert à ne pas signaler une modification qui n'en est pas une. */
function sameTiers(a: readonly AlertThresholdTier[], b: readonly AlertThresholdTier[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (tier, index) =>
        tier.upToQuantity === b[index]?.upToQuantity &&
        tier.thresholdPercent === b[index]?.thresholdPercent,
    )
  );
}
