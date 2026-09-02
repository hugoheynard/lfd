import type { CatalogItem, PimFacts } from "./catalog-item.js";

/** L'état d'une version, sérialisé pour la persistance — aucun type Prisma ici. */
export interface CatalogVersionState {
  readonly id: string;
  /** L'arrivée validée qui l'a produite. */
  readonly deliveryId: string;
  /** L'ancre PIM d'où venait cette livraison — chaîne opaque, jamais une clé. */
  readonly revisionId: string;
  /** L'empreinte de la projection livrée, celle que le push a exigée. */
  readonly fingerprint: string;
  /** Les SKU écartés à cette validation. `[]` = tout a été pris. */
  readonly excludedSkus: readonly string[];
  readonly createdAt: Date;
  readonly createdBy: string | null;
  /** Les faits PIM du miroir, un par SKU, triés par SKU. */
  readonly lines: readonly PimFacts[];
}

/** Tri stable des lignes. `<` et non `localeCompare` : celui-ci dépend d'ICU. */
function bySku(left: PimFacts, right: PimFacts): number {
  if (left.sku < right.sku) {
    return -1;
  }
  return left.sku > right.sku ? 1 : 0;
}

/**
 * **Une version du catalogue accepté** — la photographie complète du miroir des
 * faits, prise juste après une validation.
 *
 * ## Ce qu'elle photographie, et pourquoi ce n'est pas le snapshot reçu
 *
 * Une ligne par SKU **en catalogue**, portant le fait PIM en vigueur pour ce SKU :
 * issu de cette livraison s'il a été accepté, de la **précédente** s'il a été
 * écarté. Photographier le snapshot reçu contredirait le geste d'écarter — un
 * SKU écarté n'a pas changé, et sa version le dirait pourtant changé.
 *
 * C'est aussi ce qui rend le refus d'un **retrait** exprimable. Un retrait est
 * une absence dans le snapshot : on ne peut pas « écarter » une absence dans une
 * liste de lignes. Ici on n'écarte pas une ligne, on écarte un SKU — et un SKU
 * écarté garde ses faits courants, **y compris son existence**. Les trois cas —
 * ajout, changement, retrait — se traitent d'une seule règle.
 *
 * Cas limite, et il tombe juste : un **ajout** écarté n'a aucun fait antérieur,
 * donc il n'entre pas au catalogue et n'est dans aucune version. C'est
 * exactement ce qu'on veut — il n'est pas en vente.
 *
 * ## Le prix REÇU, jamais l'effectif
 *
 * Une version est le résultat d'un geste de validation, à une date, et elle est
 * immuable après pose. Le prix effectif, lui, bouge par construction : un
 * commercial renégocie sans qu'aucune livraison n'arrive. Y inscrire l'effectif
 * donnerait un objet immuable **faux dès la première renégociation** — d'où
 * {@link CatalogItem.pimFacts}, qui ne laisse pas sortir la décision.
 *
 * ## Immuable, donc sans mutateur
 *
 * Aucune méthode ne change une version après sa pose : il n'y a ni `revise()`,
 * ni `save()`, seulement `append()` côté port. Une archive qui se modifie
 * n'atteste plus rien.
 */
export class CatalogVersion {
  private constructor(private readonly state: CatalogVersionState) {}

  /**
   * Photographie le miroir tel qu'il est **après** application d'une arrivée.
   *
   * Prend les agrégats plutôt que des primitives : c'est l'article qui sait
   * quels faits il porte, et l'appelant n'a aucun moyen d'en fabriquer un
   * partiel.
   */
  static photograph(input: {
    readonly id: string;
    readonly deliveryId: string;
    readonly revisionId: string;
    readonly fingerprint: string;
    readonly excludedSkus: readonly string[];
    readonly createdAt: Date;
    readonly createdBy: string | null;
    readonly mirror: readonly CatalogItem[];
  }): CatalogVersion {
    return new CatalogVersion({
      id: input.id,
      deliveryId: input.deliveryId,
      revisionId: input.revisionId,
      fingerprint: input.fingerprint,
      // Copiés plutôt que référencés : un agrégat ne partage pas son état avec
      // l'appelant, qui pourrait sinon le muter après coup.
      excludedSkus: [...input.excludedSkus],
      createdAt: input.createdAt,
      createdBy: input.createdBy,
      // Triées à la pose : deux versions d'un catalogue identique doivent se
      // comparer ligne à ligne sans dépendre de l'ordre physique des lignes.
      lines: input.mirror.map((item) => item.pimFacts).sort(bySku),
    });
  }

  /** Rehydrate depuis la persistance. */
  static reconstitute(state: CatalogVersionState): CatalogVersion {
    return new CatalogVersion(state);
  }

  get id(): string {
    return this.state.id;
  }

  get deliveryId(): string {
    return this.state.deliveryId;
  }

  get revisionId(): string {
    return this.state.revisionId;
  }

  get fingerprint(): string {
    return this.state.fingerprint;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get excludedSkus(): readonly string[] {
    return this.state.excludedSkus;
  }

  get lines(): readonly PimFacts[] {
    return this.state.lines;
  }

  get lineCount(): number {
    return this.state.lines.length;
  }

  /** Le fait en vigueur pour un SKU à cette version, ou `null` s'il n'y était pas. */
  factsFor(sku: string): PimFacts | null {
    return this.state.lines.find((line) => line.sku === sku) ?? null;
  }

  /** L'état à écrire — l'adaptateur lit ceci, jamais les champs un par un. */
  toPersistence(): CatalogVersionState {
    return this.state;
  }
}
