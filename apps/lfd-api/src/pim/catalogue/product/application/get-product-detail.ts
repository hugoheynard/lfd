import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PimJournalReader } from "../../../journal/pim-journal-reader.js";
import { isContentFact } from "../domain/content-facts.js";
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
   * @deprecated Mesure fausse dans les deux sens, remplacée par
   *   {@link ProductDetail.readinessStale}. Elle lit `product.updated_at`, un
   *   `@updatedAt` posé sur la ligne qui porte `status` : **mettre en vente
   *   périmait donc la signature qui justifiait la mise en vente**. Et elle
   *   ignore `ProductContextVat` / `ProductChannelOverride`, si bien qu'un
   *   changement de taux ou de canal ne périmait rien.
   *
   *   Le champ reste servi UN déploiement, le temps que les fronts en ligne
   *   basculent sur `readinessStale` (audit 2026-09-01, tranche 3 — étendre,
   *   basculer, resserrer). À supprimer au resserrement, avec la méthode
   *   `ReadinessRepository.contentUpdatedAt` qui n'aura plus de lecteur.
   */
  readonly contentUpdatedAt: string;
  /**
   * La signature vaut-elle encore ?
   *
   * `false` quand personne n'a signé — il n'y a alors rien à périmer, et rendre
   * `true` ferait afficher un avertissement sur une fiche que nul n'a validée.
   *
   * Calculé sur les **faits** et non sur des horodatages de ligne : le journal
   * dit précisément ce qui a changé, dans la même transaction que l'écriture,
   * et il ne confond pas un statut avec un prix. Cf.
   * `domain/content-facts.ts` pour le tri, et l'audit du 2026-09-01 pour ce que
   * l'ancienne mesure affirmait de faux.
   */
  readonly readinessStale: boolean;
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
    private readonly journal: PimJournalReader,
    private readonly clock: Clock,
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
      readinessStale: await this.staleSince(query.id, readiness?.readyAt ?? null),
      // Les dates sortent en ISO ici, comme partout dans les vues : le port les
      // manipule en `Date` parce qu'il compare, la vue en chaînes parce qu'elle
      // voyage. `findById` a répondu juste au-dessus, donc la ligne existe et a
      // une date — le `??` ne couvre que la course, supprimée entre les deux
      // lectures.
      contentUpdatedAt: (contentUpdatedAt ?? new Date(0)).toISOString(),
    };
  }

  /**
   * Un fait de CONTENU a-t-il eu lieu depuis la signature ?
   *
   * On n'interroge le journal que s'il y a une signature, et on ne lit que
   * l'intervalle qui suit : sur une fiche signée hier, c'est zéro ligne ou
   * quelques-unes, pas l'historique. L'index `(subject_type, subject_id,
   * occurred_at)` couvre exactement cette requête.
   *
   * `since` est EXCLUSIF côté port, et c'est la bonne borne : un fait daté de
   * la milliseconde de la signature n'est pas postérieur à elle. C'est le même
   * choix que le `>=` de l'ancienne comparaison — déclarer ne touche pas au
   * contenu, donc une signature posée dans la même milliseconde qu'un
   * enregistrement reste valide.
   */
  private async staleSince(productId: string, readyAt: Date | null): Promise<boolean> {
    if (readyAt === null) {
      return false;
    }
    const facts = await this.journal.factsAbout(
      "product",
      productId,
      readyAt,
      new Date(this.clock.now()),
    );
    return facts.some((fact) => isContentFact(fact.type));
  }
}
