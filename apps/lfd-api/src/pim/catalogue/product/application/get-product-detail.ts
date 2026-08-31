import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { EditorialReader } from "../domain/ports/editorial-reader.js";
import type { ProductEditorialView, ProductMediaRecord } from "../domain/ports/editorial-reader.js";
import { ProductRepository, type ProductRecord } from "../domain/ports/product.repository.js";
import { ReadinessRepository } from "../domain/ports/readiness.repository.js";

/** Détail complet : le socle, sa couche éditoriale, ses visuels et sa signature. */
export type ProductDetail = ProductRecord & {
  readonly editorial: ProductEditorialView | null;
  readonly media: readonly ProductMediaRecord[];
  /** `null` = personne ne s'est prononcé sur cette fiche. */
  readonly readiness: { readonly readyAt: string; readonly readyBy: string } | null;
  /**
   * Quand le contenu de la fiche a bougé pour la dernière fois.
   *
   * Il voyage AVEC la déclaration et jamais sans : seule leur comparaison dit
   * si la signature vaut encore. Les séparer laisserait un appelant afficher
   * « publiable » sur une fiche modifiée depuis.
   */
  readonly contentUpdatedAt: string;
};

export class GetProductDetailQuery {
  constructor(readonly id: string) {}
}

@QueryHandler(GetProductDetailQuery)
export class GetProductDetailHandler implements IQueryHandler<
  GetProductDetailQuery,
  ProductDetail | null
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly editorials: EditorialReader,
    private readonly readiness: ReadinessRepository,
  ) {}

  async execute(query: GetProductDetailQuery): Promise<ProductDetail | null> {
    const product = await this.products.findById(query.id);
    if (product === null) {
      return null;
    }
    const [editorial, media, readiness, contentUpdatedAt] = await Promise.all([
      this.editorials.findByProduct(query.id),
      this.editorials.mediaOf(query.id),
      this.readiness.read(query.id),
      this.readiness.contentUpdatedAt(query.id),
    ]);
    return {
      ...product.snapshot(),
      editorial,
      media,
      readiness:
        readiness === null
          ? null
          : { readyAt: readiness.readyAt.toISOString(), readyBy: readiness.readyBy },
      // Les dates sortent en ISO ici, comme partout dans les vues : le port les
      // manipule en `Date` parce qu'il compare, la vue en chaînes parce qu'elle
      // voyage. `findById` a répondu juste au-dessus, donc la ligne existe et a
      // une date — le `??` ne couvre que la course, supprimée entre les deux
      // lectures.
      contentUpdatedAt: (contentUpdatedAt ?? new Date(0)).toISOString(),
    };
  }
}
