import { Injectable } from "@nestjs/common";

import { OperationImageRepointing } from "../b2b/operations/channels/media/operation-image-repointing.js";
import { OperationMediaUsage } from "../b2b/operations/channels/media/operation-media-usage.js";
import {
  MediaCarriers,
  type Carrier,
  type ImageReplacement,
} from "../media/channels/carriers/media-carriers.js";
import type { WriteTicket } from "../platform/journal/scoped-journal.js";

/**
 * **Ce que les OPÉRATIONS DU COMMERCE répondent à la médiathèque** (lot 2 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * « L'image : partir de ce qui existe »).
 *
 * Il prend la place de `CatalogCopyMediaCarriers` quand l'interrupteur
 * `OPERATIONS_AT_COMMERCE` est OUVERT : même table, mais ce ne sont plus des
 * copies — le commerce est la source, son `repoint()` écrit l'agrégat
 * (charger, muter, sauver) au lieu de rendre 0 en attendant le fait du
 * référentiel.
 *
 * Ici, dans `appBootstrap/`, pour la raison de `StorefrontMediaCarriers` : la
 * ligne `b2b` de la matrice n'a pas `media`.
 *
 * `kind: "operation"`, id = la clé : le lien de la médiathèque mène à
 * `/operations/<clé>`, l'écran « Opérations », que la bascule fait écrire au
 * commerce (O6). Le libellé est le nom seul, comme au référentiel — l'écran
 * dit déjà « Opération ».
 */
@Injectable()
export class CommerceOperationMediaCarriers extends MediaCarriers {
  constructor(
    private readonly usage: OperationMediaUsage,
    private readonly repointing: OperationImageRepointing,
  ) {
    super();
  }

  usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    return this.usage.usesOf(urls);
  }

  async carriersOf(url: string): Promise<readonly Carrier[]> {
    const usages = await this.usage.usagesOf(url);
    return usages.map(({ operationKey, label }) => ({
      kind: "operation",
      id: operationKey,
      label,
    }));
  }

  repoint(replacement: ImageReplacement, ticket: WriteTicket): Promise<number> {
    return this.repointing.repoint(replacement, ticket);
  }
}
