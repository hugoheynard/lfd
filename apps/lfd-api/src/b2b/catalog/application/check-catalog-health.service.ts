import { Injectable } from "@nestjs/common";
import type { CatalogHealthView } from "@lfd/contracts";

import { compareToReference } from "../domain/catalog-parity.js";
import { CatalogAdminReader } from "../domain/ports/catalog-admin.reader.js";
import { CatalogVersionReader } from "../domain/ports/catalog-version.reader.js";
import { asMirrorEntry } from "./check-catalog-parity.service.js";

/**
 * **Le miroir a-t-il décroché de ce qu'on a validé ?**
 *
 * Même comparateur que la parité — `compareToReference` est pure et reste seule
 * — mais **un autre référent**, et c'est là toute la tranche. La parité compare
 * à « ce que le référentiel publierait maintenant » ; celle-ci compare à « la
 * dernière version que la plateforme a acceptée ».
 *
 * ## Pourquoi le référent décide de tout
 *
 * Le §6 fait exprès que le miroir retarde : le PIM pousse, personne ne valide
 * encore, et c'est normal. Un contrôle de santé qui prendrait la projection du
 * moment pour référence afficherait donc un écart **parfaitement légitime en
 * permanence** — c'est-à-dire un écran qu'on n'ouvre plus. Deux questions, un
 * comparateur, deux référents.
 *
 * ## Ce que cet écart veut dire, et pourquoi il réveille
 *
 * Rien de normal ne le produit. Ce qui reste : une ingestion interrompue en
 * cours de route, une écriture directe en base, une restauration de sauvegarde.
 * C'est exactement ce qu'un contrôle de parité existe pour attraper, et ce qu'il
 * ne savait pas montrer.
 *
 * ⚠️ **Sans version, il n'y a rien à comparer**, et le dire est la seule réponse
 * honnête : la boîte de réception n'a jamais été ouverte, donc aucune validation
 * n'a eu lieu. Rendre un rapport vide annoncerait un catalogue sain sur un
 * contrôle qui n'a pas eu lieu.
 */
@Injectable()
export class CheckCatalogHealthService {
  constructor(
    private readonly versions: CatalogVersionReader,
    private readonly catalog: CatalogAdminReader,
  ) {}

  async check(): Promise<CatalogHealthView> {
    const currentId = await this.versions.currentId();
    if (currentId === null) {
      return { version: null, drift: null };
    }
    const [version, mirror] = await Promise.all([
      this.versions.byId(currentId),
      this.catalog.list(),
    ]);
    if (version === null) {
      // La version a disparu entre les deux lectures. Impossible en pratique —
      // une archive ne se supprime pas — mais l'inventer serait pire que le dire.
      return { version: null, drift: null };
    }

    return {
      version: {
        id: version.id,
        revisionId: version.revisionId,
        createdAt: version.createdAt.toISOString(),
        itemCount: version.lineCount,
      },
      drift: compareToReference(
        version.lines.map((line) => ({
          sku: line.sku,
          name: line.name,
          // Le prix REÇU, des deux côtés : la version archive ce que le PIM a
          // livré, et le miroir garde ce même prix à côté de la décision locale.
          // Comparer l'effectif ferait sonner l'alarme sur chaque négociation.
          priceMillicents: line.priceMillicents,
          vatRate: line.vatRatePercent,
        })),
        mirror.map(asMirrorEntry),
      ),
    };
  }
}
