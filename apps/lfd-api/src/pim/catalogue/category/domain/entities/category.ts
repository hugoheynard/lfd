import {
  CategoryFrozenError,
  CategorySelfParentError,
  CategoryUnknownContextError,
} from "../errors/category-errors.js";
import {
  slugify,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";
import type { SalesContext } from "../../../../sales-contexts/domain/value-objects/sales-context.js";
import type { ContextVat } from "../../../shared/domain/value-objects/context-vat.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";

/**
 * **La famille — l'agrégat.**
 *
 * Ce que cet objet garantit, et que personne n'a plus à se rappeler :
 *
 * - le **slug suit toujours le nom**. Il était jusqu'ici re-dérivé à la main
 *   par chaque appelant (`slugOf(name)` à la création, puis au renommage) ;
 *   le premier verbe qui oubliait faisait diverger les deux en silence. Le
 *   slug n'a plus de passage par l'extérieur : `rename` le recalcule ;
 * - une famille **n'est jamais sa propre parente** ;
 * - un taux **ne se règle que pour un contexte connu** — et pour tout contexte
 *   connu, vendu ou non : la TVA ne dépend plus des canaux (2026-10-15) ;
 * - une famille **archivée est gelée** : ses réglages — TVA, place
 *   dans l'arbre — sont refusés. Seul le **renommage** reste permis, parce
 *   qu'une faute de frappe doit pouvoir se corriger sans ressusciter une
 *   famille qui ne vend plus rien.
 *
 * Ce qu'il ne peut PAS garantir, faute de voir plus loin que lui-même, et qui
 * reste donc aux handlers : que le parent existe, que le déplacement ne crée
 * pas de cycle (il faut l'arbre entier — cf. `domain/services/category-tree`),
 * qu'aucun produit actif n'y est rattaché, que le taux de TVA visé existe.
 * Un objet ne garantit que ce qu'il voit.
 */
export interface CategorySnapshot {
  readonly id: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
  readonly isArchived: boolean;
  /** Les taux visés, **par clé de contexte**. Clé absente = non réglé. */
  readonly vatByContext: ContextVat;
  /** À qui la famille vend — ses fiches en héritent tant qu'elles ne dérogent pas. */
  readonly audience: Audience;
}

/** Ce qu'il faut pour ouvrir une famille. Le reste, l'agrégat le décide. */
export interface NewCategoryInput {
  readonly id: string;
  readonly name: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
}

export class Category {
  private constructor(
    private readonly identity: string,
    private nameValue: LocalizedText,
    private slugValue: LocalizedText,
    private parentIdValue: string | null,
    private positionValue: number,
    private archivedValue: boolean,
    private vatByContextValue: ContextVat,
    private audienceValue: Audience,
  ) {}

  /** Ouvre une famille : vivante, sans TVA réglée. */
  static open(input: NewCategoryInput): Category {
    if (input.parentId === input.id) {
      throw new CategorySelfParentError(input.id);
    }
    return new Category(
      input.id,
      input.name,
      slugOf(input.name),
      input.parentId,
      input.position,
      false,
      {},
      // `both` : c'est ce que faisait toute famille avant que l'audience
      // existe (1a du plan d'audience), et le défaut de la colonne.
      "both",
    );
  }

  /** Reconstitue depuis la base — l'état y est déjà valide. */
  static reconstitute(snapshot: CategorySnapshot): Category {
    return new Category(
      snapshot.id,
      snapshot.name,
      snapshot.slug,
      snapshot.parentId,
      snapshot.position,
      snapshot.isArchived,
      snapshot.vatByContext,
      snapshot.audience,
    );
  }

  get id(): string {
    return this.identity;
  }

  get name(): LocalizedText {
    return this.nameValue;
  }

  get slug(): LocalizedText {
    return this.slugValue;
  }

  get parentId(): string | null {
    return this.parentIdValue;
  }

  get position(): number {
    return this.positionValue;
  }

  get isArchived(): boolean {
    return this.archivedValue;
  }

  /**
   * Les taux, **d'un bloc** — la même valeur que `setVat` reprend.
   *
   * Un getter par canal invitait à en lire un et à oublier les autres : c'est
   * exactement ce qui s'est passé quand la projection B2B a lu `emporterTvaId`
   * faute de mieux, et a facturé les professionnels au taux à emporter pendant
   * tout ce temps. Lire la valeur entière rend l'oubli visible au point d'usage.
   */
  get vatByContext(): ContextVat {
    return this.vatByContextValue;
  }

  get audience(): Audience {
    return this.audienceValue;
  }

  /**
   * Change à qui la famille vend. Refusé sur une famille archivée, comme ses
   * autres réglages (cf. en-tête).
   *
   * @returns `false` quand elle y vendait déjà — rien à écrire au journal.
   */
  changeAudience(audience: Audience): boolean {
    this.refuseIfArchived();
    if (this.audienceValue === audience) {
      return false;
    }
    this.audienceValue = audience;
    return true;
  }

  /** Le taux visé pour UN contexte, ou `null` s'il n'est pas réglé. */
  vatOf(contextKey: string): string | null {
    return this.vatByContextValue[contextKey] ?? null;
  }

  /** Renomme — et **re-dérive le slug**. Permis même archivée (cf. en-tête). */
  rename(name: LocalizedText): void {
    this.nameValue = name;
    this.slugValue = slugOf(name);
  }

  /** Déplace sous un parent (`null` = racine), à la place donnée. */
  moveUnder(parentId: string | null, position: number): void {
    this.refuseIfArchived();
    if (parentId === this.identity) {
      throw new CategorySelfParentError(this.identity);
    }
    this.parentIdValue = parentId;
    this.positionValue = position;
  }

  /** Change le rang dans la fratrie, sans changer de parent. */
  placeAt(position: number): void {
    this.refuseIfArchived();
    this.positionValue = position;
  }

  /**
   * Règle les taux **d'un bloc**, un par contexte de vente.
   *
   * Une carte plutôt que des arguments positionnels : à trois taux, une liste
   * de `string | null` devient un piège — inverser « sur place » et « B2B » ne
   * se voit ni au compilateur ni à la lecture, et se paie en TVA facturée.
   *
   * Les contextes viennent du registre, pas de l'agrégat : il ne peut pas
   * savoir seul quels contextes existent, et un objet ne garantit que ce qu'il
   * voit. Ce qu'il garantit, lui : **rien ne se règle pour un contexte
   * inconnu**. Un contexte que la famille ne vend pas se règle : la matrice ne
   * décide plus de la TVA (2026-10-15).
   */
  setVat(vat: ContextVat, contexts: readonly SalesContext[]): void {
    this.refuseIfArchived();
    this.refuseUnknownContext(vat, contexts);
    this.vatByContextValue = { ...vat };
  }

  /** Idempotent : archiver deux fois n'est pas une erreur, c'est un état visé. */
  archive(): void {
    this.archivedValue = true;
  }

  snapshot(): CategorySnapshot {
    return {
      id: this.identity,
      name: this.nameValue,
      slug: this.slugValue,
      parentId: this.parentIdValue,
      position: this.positionValue,
      isArchived: this.archivedValue,
      vatByContext: this.vatByContextValue,
      audience: this.audienceValue,
    };
  }

  private refuseUnknownContext(vat: ContextVat, contexts: readonly SalesContext[]): void {
    const known = new Set(contexts.map((context) => context.key));
    for (const key of Object.keys(vat)) {
      if (!known.has(key)) {
        throw new CategoryUnknownContextError(key);
      }
    }
  }

  private refuseIfArchived(): void {
    if (this.archivedValue) {
      throw new CategoryFrozenError(this.identity);
    }
  }
}

/** Le slug d'une famille — dérivé du nom, jamais saisi. */
function slugOf(name: LocalizedText): LocalizedText {
  return name.en === undefined
    ? { fr: slugify(name.fr) }
    : { fr: slugify(name.fr), en: slugify(name.en) };
}
