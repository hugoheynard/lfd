import {
  CategoryFrozenError,
  CategorySelfParentError,
  CategoryTvaWithoutChannelError,
} from "../errors/category-errors.js";
import {
  slugify,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";
import {
  defaultSalesChannels,
  normalizeSalesChannels,
  sellsMode,
  type SalesChannels,
} from "../../../shared/domain/value-objects/sales-channels.js";

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
  readonly emporterTvaId: string | null;
  readonly surPlaceTvaId: string | null;
  readonly b2bTvaId: string | null;
}

/**
 * Les taux d'une famille, **un par canal de vente**. `null` = non réglé.
 *
 * Le mode de consommation décide du taux — c'est la loi, pas un choix de
 * boutique — donc « à emporter » et « sur place » ne se déclinent pas par
 * boutique. Le B2B a le sien parce que vendre à un professionnel n'est ni l'un
 * ni l'autre ; jusqu'ici la plateforme facturait au taux « à emporter »,
 * emprunté sans que rien ne le dise.
 */
export interface CategoryTvaIds {
  readonly emporter: string | null;
  readonly surPlace: string | null;
  readonly b2b: string | null;
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
    private emporterTvaIdValue: string | null,
    private surPlaceTvaIdValue: string | null,
    private b2bTvaIdValue: string | null,
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
      null,
      null,
      null,
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
      snapshot.emporterTvaId,
      snapshot.surPlaceTvaId,
      snapshot.b2bTvaId,
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
   * Trois getters séparés invitaient à en lire un et à oublier les autres :
   * c'est exactement ce qui s'est passé quand la projection B2B a lu
   * `emporterTvaId` faute de mieux, et a facturé les professionnels au taux à
   * emporter pendant tout ce temps. Lire la valeur entière rend l'oubli
   * visible au point d'usage.
   */
  get tvaIds(): CategoryTvaIds {
    return {
      emporter: this.emporterTvaIdValue,
      surPlace: this.surPlaceTvaIdValue,
      b2b: this.b2bTvaIdValue,
    };
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
  setChannels(channels: SalesChannels): void {
    this.refuseIfArchived();
    this.channelPresetValue = normalizeSalesChannels(channels);
    this.forgetTvaOfClosedChannels();
  }

  /**
   * Règle les taux **d'un bloc**, un par canal de vente.
   *
   * Un record plutôt que des arguments positionnels : à trois taux, une liste
   * de `string | null` devient un piège — inverser « sur place » et « B2B » ne
   * se voit ni au compilateur ni à la lecture, et se paie en TVA facturée.
   */
  setTva(ids: CategoryTvaIds): void {
    this.refuseIfArchived();
    this.refuseTvaWithoutChannel(ids);
    this.emporterTvaIdValue = ids.emporter;
    this.surPlaceTvaIdValue = ids.surPlace;
    this.b2bTvaIdValue = ids.b2b;
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
      emporterTvaId: this.emporterTvaIdValue,
      surPlaceTvaId: this.surPlaceTvaIdValue,
      b2bTvaId: this.b2bTvaIdValue,
    };
  }

  /** Quels canaux la famille vend, lus une fois pour les deux règles ci-dessous. */
  private soldChannels(): Record<keyof CategoryTvaIds, boolean> {
    return {
      emporter: sellsMode(this.channelPresetValue, "emporter"),
      surPlace: sellsMode(this.channelPresetValue, "surPlace"),
      b2b: this.channelPresetValue.b2b,
    };
  }

  private refuseTvaWithoutChannel(ids: CategoryTvaIds): void {
    const sold = this.soldChannels();
    for (const channel of ["emporter", "surPlace", "b2b"] as const) {
      if (ids[channel] !== null && !sold[channel]) {
        throw new CategoryTvaWithoutChannelError(channel);
      }
    }
  }

  private forgetTvaOfClosedChannels(): void {
    const sold = this.soldChannels();
    if (!sold.emporter) {
      this.emporterTvaIdValue = null;
    }
    if (!sold.surPlace) {
      this.surPlaceTvaIdValue = null;
    }
    if (!sold.b2b) {
      this.b2bTvaIdValue = null;
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
