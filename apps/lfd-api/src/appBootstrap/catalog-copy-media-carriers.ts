import { Injectable } from "@nestjs/common";

import { CatalogMediaCopies } from "../b2b/catalog/channels/media/catalog-media-copies.js";
import { MediaCarriers, type Carrier } from "../media/channels/carriers/media-carriers.js";

/**
 * **Ce que les COPIES du catalogue du commerce répondent à la médiathèque**
 * (décision R18, 2026-10-10) : une opération reçue qui montre une image la
 * retient, même quand le référentiel ne la porte plus.
 *
 * Ici, dans `appBootstrap/`, pour la raison de `StorefrontMediaCarriers` : la
 * ligne `b2b` de la matrice n'a pas `media`.
 *
 * `kind: "operation"`, et non un `kind` neuf : le lien mène à l'opération du
 * référentiel, là où son image se décide, et le libellé dit que c'est la copie
 * de la boutique. Un `kind` neuf aurait touché le contrat `MediaCarrierView` et
 * la table des destinations de l'écran.
 */
@Injectable()
export class CatalogCopyMediaCarriers extends MediaCarriers {
  constructor(private readonly copies: CatalogMediaCopies) {
    super();
  }

  usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    return this.copies.usesOf(urls);
  }

  async carriersOf(url: string): Promise<readonly Carrier[]> {
    const copies = await this.copies.copiesOf(url);
    return copies.map(({ operationKey, name }) => ({
      kind: "operation",
      id: operationKey,
      label: `Boutique — opération « ${name} » (copie, suit au prochain envoi du catalogue)`,
    }));
  }

  /**
   * **Ne repointe rien, et rend 0.** Une copie suit son original au prochain
   * push du catalogue, et seulement là : la réécrire ici ferait dire au
   * commerce ce que le référentiel n'a pas encore envoyé. Tant que ce push
   * n'a pas eu lieu, l'ancienne image reste « employée » — c'est le but.
   */
  repoint(): Promise<number> {
    return Promise.resolve(0);
  }
}
