import { Injectable } from "@nestjs/common";
import type { CatalogIngestionReport, CatalogSnapshot } from "@lfd/catalog-sync";

/**
 * Le **port de sortie** du canal plateforme B2B, et la seule chose que le
 * référentiel publie à son sujet.
 *
 * Il portait un `POST` signé vers l'autre backend. Les deux vivent maintenant
 * dans le même processus, et le transport a disparu : l'implémentation `live`
 * est fournie par la plateforme elle-même (`b2b/catalog/`), qui **conforme** à
 * cette interface parce qu'elle est du côté aval du fil. Le référentiel, lui,
 * ne connaît toujours ni son destinataire ni la forme de son stockage — la
 * seule chose qui ait changé, c'est qu'il n'y a plus de réseau à tomber entre
 * les deux.
 *
 * Deux pilotes concrets, comme pour Shopify : une simulation qui ne touche
 * rien, et l'envoi réel. Le service de push choisit ; il ne sait pas lequel il
 * tient, et c'est ce qui rend le chemin testable de bout en bout.
 */
/** Ce que le référentiel dit de la livraison qu'il envoie. */
export interface CatalogDeliveryOrigin {
  /** L'ancre posée par ce push — opaque pour la plateforme, jamais une clé étrangère. */
  readonly revisionId: string;
  /** L'empreinte de la projection livrée, celle que le push vient d'exiger. */
  readonly fingerprint: string;
}

export abstract class B2bCatalogDriver {
  abstract readonly mode: "dry-run" | "live";
  /**
   * @param origin d'où vient ce snapshot, côté référentiel.
   *
   * Les deux **voyagent** plutôt que d'être retrouvés de l'autre côté, et ce
   * n'est pas une commodité. L'ancre, la plateforme ne peut pas la lire : ce
   * serait franchir la frontière vers les tables du référentiel. L'empreinte,
   * elle, pourrait être recalculée — mais une empreinte recalculée est une
   * AUTRE empreinte : elle dirait ce que le catalogue est devenu, là où on veut
   * savoir ce qui a été relu.
   */
  abstract send(
    snapshot: CatalogSnapshot,
    origin: CatalogDeliveryOrigin,
  ): Promise<CatalogIngestionReport>;
}

/**
 * Simulation : projette, compte, et n'écrit rien.
 *
 * Le rapport rendu est **cohérent avec ce qui partirait** plutôt que vide — un
 * aperçu qui annonce zéro n'apprend rien à celui qui s'apprête à pousser. Seul
 * `removedSkus` reste vide, et c'est correct : lui seul suppose de connaître
 * l'état de l'autre côté.
 */
@Injectable()
export class DryRunB2bCatalogDriver extends B2bCatalogDriver {
  readonly mode = "dry-run" as const;

  /**
   * Le rapport, **sans origine**.
   *
   * Une simulation n'a pas d'ancre à citer : elle n'en pose plus. Le paramètre
   * `origin` de {@link B2bCatalogDriver.send} restait donc à remplir avec un
   * identifiant qu'il fallait d'abord fabriquer — et c'est précisément ce qui
   * faisait qu'un simple regard écrivait une révision.
   */
  simulate(snapshot: CatalogSnapshot): CatalogIngestionReport {
    return {
      // Une simulation n'entre nulle part : ni faits de vente, ni réception.
      status: "applied" as const,
      acceptedProducts: snapshot.products.length,
      acceptedVariants: snapshot.products.reduce(
        (total, product) => total + product.variants.length,
        0,
      ),
      acceptedCategories: snapshot.categories.length,
      removedSkus: [],
      appliedAt: snapshot.generatedAt,
    };
  }

  /** Le port reste honoré : l'origine est simplement sans emploi ici. */
  send(snapshot: CatalogSnapshot): Promise<CatalogIngestionReport> {
    return Promise.resolve(this.simulate(snapshot));
  }
}
