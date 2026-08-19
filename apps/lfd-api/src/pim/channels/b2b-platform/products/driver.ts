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
export abstract class B2bCatalogDriver {
  abstract readonly mode: "dry-run" | "live";
  abstract send(snapshot: CatalogSnapshot): Promise<CatalogIngestionReport>;
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

  send(snapshot: CatalogSnapshot): Promise<CatalogIngestionReport> {
    return Promise.resolve({
      acceptedProducts: snapshot.products.length,
      acceptedVariants: snapshot.products.reduce(
        (total, product) => total + product.variants.length,
        0,
      ),
      acceptedCategories: snapshot.categories.length,
      removedSkus: [],
      appliedAt: snapshot.generatedAt,
    });
  }
}
