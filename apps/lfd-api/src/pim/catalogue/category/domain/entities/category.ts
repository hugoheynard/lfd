import {
  CategoryFrozenError,
  CategorySelfParentError,
  CategoryTvaWithoutChannelError,
  CategoryUnknownContextError,
} from "../errors/category-errors.js";
import {
  slugify,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";
import {
  defaultSalesChannels,
  normalizeSalesChannels,
  type SalesChannels,
} from "../../../shared/domain/value-objects/sales-channels.js";
import {
  contextIsSold,
  type ContextTva,
  type SalesContext,
} from "../../../shared/domain/value-objects/sales-context.js";

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
 * - un taux **ne se règle que pour un canal vendu**, et fermer un canal
 *   **efface** son taux. Cette règle vivait dans le navigateur : le panneau
 *   envoyait les canaux, PUIS les taux nettoyés, en deux requêtes sans
 *   transaction — la seconde perdue laissait une famille qui ne vend plus en
 *   B2B et pointe toujours son taux B2B. L'agrégat voit les deux moitiés de la
 *   règle, c'est donc à lui de la tenir ;
 * - une famille **archivée est gelée** : ses réglages — canaux, TVA, place
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
  readonly channelPreset: SalesChannels;
  /** Les taux visés, **par clé de contexte**. Clé absente = non réglé. */
  readonly tvaByContext: ContextTva;
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
    private channelPresetValue: SalesChannels,
    private tvaByContextValue: ContextTva,
  ) {}

  /** Ouvre une famille : vivante, sans canal vendu, sans TVA réglée. */
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
      defaultSalesChannels(),
      {},
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
      snapshot.channelPreset,
      snapshot.tvaByContext,
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
   * Les taux, **d'un bloc** — la même valeur que `setTva` reprend.
   *
   * Un getter par canal invitait à en lire un et à oublier les autres : c'est
   * exactement ce qui s'est passé quand la projection B2B a lu `emporterTvaId`
   * faute de mieux, et a facturé les professionnels au taux à emporter pendant
   * tout ce temps. Lire la valeur entière rend l'oubli visible au point d'usage.
   */
  get tvaByContext(): ContextTva {
    return this.tvaByContextValue;
  }

  /** Le taux visé pour UN contexte, ou `null` s'il n'est pas réglé. */
  tvaOf(contextKey: string): string | null {
    return this.tvaByContextValue[contextKey] ?? null;
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
   * Change ce qui est vendu — et **efface le taux des canaux qu'on ferme**.
   *
   * Deux verbes, un seul invariant : sans cet effacement, il faudrait que
   * l'appelant enchaîne `setTva` derrière, et un appelant qui l'oublie (ou une
   * requête perdue entre les deux) laisse un taux orphelin.
   */
  setChannels(channels: SalesChannels, contexts: readonly SalesContext[]): void {
    this.refuseIfArchived();
    this.channelPresetValue = normalizeSalesChannels(channels);
    this.forgetTvaOfClosedChannels(contexts);
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
   * voit. Ce qu'il garantit, lui : un taux ne se règle pas pour un contexte
   * qu'on ne vend pas, et **rien ne se règle pour un contexte inconnu**.
   */
  setTva(tva: ContextTva, contexts: readonly SalesContext[]): void {
    this.refuseIfArchived();
    this.refuseUnknownContext(tva, contexts);
    this.refuseTvaWithoutChannel(tva, contexts);
    this.tvaByContextValue = { ...tva };
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
      channelPreset: this.channelPresetValue,
      tvaByContext: this.tvaByContextValue,
    };
  }

  private refuseUnknownContext(tva: ContextTva, contexts: readonly SalesContext[]): void {
    const known = new Set(contexts.map((context) => context.key));
    for (const key of Object.keys(tva)) {
      if (!known.has(key)) {
        throw new CategoryUnknownContextError(key);
      }
    }
  }

  private refuseTvaWithoutChannel(tva: ContextTva, contexts: readonly SalesContext[]): void {
    for (const context of contexts) {
      if (tva[context.key] !== undefined && !contextIsSold(context, this.channelPresetValue)) {
        throw new CategoryTvaWithoutChannelError(context.key);
      }
    }
  }

  /**
   * Fermer un canal **efface** le taux des contextes qu'il portait — sans quoi
   * il faudrait que l'appelant enchaîne `setTva`, et un appelant qui l'oublie
   * laisse un taux orphelin. Un contexte qu'on ne connaît plus voit son taux
   * conservé : on n'efface pas ce qu'on ne sait pas juger.
   */
  private forgetTvaOfClosedChannels(contexts: readonly SalesContext[]): void {
    const closed = contexts.filter((context) => !contextIsSold(context, this.channelPresetValue));
    if (closed.length === 0) {
      return;
    }
    const kept: Record<string, string> = { ...this.tvaByContextValue };
    for (const context of closed) {
      delete kept[context.key];
    }
    this.tvaByContextValue = kept;
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
