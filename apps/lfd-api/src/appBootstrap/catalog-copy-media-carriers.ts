import { Injectable } from "@nestjs/common";

import { CatalogMediaCopies } from "../b2b/catalog/channels/media/catalog-media-copies.js";
import { MediaCarriers, type Carrier } from "../media/channels/carriers/media-carriers.js";

/**
 * **Ce que les COPIES du catalogue du commerce répondent à la médiathèque**
 * (depuis le 2026-10-10, `documentation/mediatheque/mediatheque.md` §2) : une opération reçue qui montre une image la
 * retient, même quand le référentiel ne la porte plus.
 *
 * Ici, dans `appBootstrap/`, pour la raison de `StorefrontMediaCarriers` : la
 * ligne `b2b` de la matrice n'a pas `media`.
 *
 * `kind: "operation"`, et non un `kind` neuf : le lien mène à l'opération du
 * référentiel, là où son image se décide, et le libellé — rédigé par le commerce,
 * `catalogMediaCopyLabel` — dit que c'est la copie de la boutique. Un `kind` neuf aurait touché le contrat `MediaCarrierView` et
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
    return copies.map(({ operationKey, label }) => ({
      kind: "operation",
      id: operationKey,
      label,
    }));
  }

  /**
   * **Ne repointe rien, et rend 0** — et c'est toujours juste depuis que la
   * copie suit sans push (2026-10-11, `mediatheque.md` §7 bis). Le
   * remplacement écrit `media.asset_described` sur la nouvelle ; le
   * référentiel la réannonce pour chaque opération qui l'affiche
   * (`pim.operation_image_changed`), et le commerce projette la copie
   * (`catalog.project-operation-image`). La réécrire ici, dans la transaction
   * du geste, ferait un second écrivain sans ordre de geste, qui dirait au
   * commerce ce que le référentiel n'a pas encore annoncé.
   *
   * Jusqu'à la livraison du fait — quelques secondes, ou le prochain push si
   * l'image a été changée sur l'opération elle-même —, l'ancienne image reste
   * « employée » par la copie : c'est ce qui empêche de la ramasser pendant
   * que la boutique la sert encore.
   */
  repoint(): Promise<number> {
    return Promise.resolve(0);
  }
}
