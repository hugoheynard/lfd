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
 * Le commerce est la source de `catalog_operations` : son `repoint()` écrit
 * l'agrégat (charger, muter, sauver). Il a remplacé les copies du push le
 * 2026-10-17 (X1 de `documentation/catalogue/catalogue-synchronise.md` §6).
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
