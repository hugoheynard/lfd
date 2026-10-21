import {
  PackedResuppliesReader,
  type PackedResupplyLines,
} from "../../../packing/channels/delivery/index.js";
import {
  type FrozenResupply,
  FrozenResuppliesReader,
} from "../../../production/channels/delivery/index.js";
import { TransferResupplyContents } from "../transfer-resupply-contents.js";

/**
 * Les doublés du réassort dans le transfert (lot R3c) — chacun ÉTEND son
 * port, donc aucun cast.
 */

/** Les réassorts figés à l'arrêt, donnés d'avance ; un réassort d'un autre jour est absent. */
export class FixedFrozenResupplies extends FrozenResuppliesReader {
  constructor(private readonly resupplies: readonly FrozenResupply[] = []) {
    super();
  }

  frozenOf(serviceDay: string, resupplyIds: readonly string[]): Promise<readonly FrozenResupply[]> {
    return Promise.resolve(
      this.resupplies.filter(
        (resupply) =>
          resupply.serviceDay === serviceDay && resupplyIds.includes(resupply.resupplyId),
      ),
    );
  }
}

/** L'emballé des fiches closes ; un réassort absent n'a pas de fiche close (`null`). */
export class FixedPackedResupplies extends PackedResuppliesReader {
  constructor(private readonly packed: ReadonlyMap<string, PackedResupplyLines> = new Map()) {
    super();
  }

  packedOf(
    resupplyIds: readonly string[],
  ): Promise<ReadonlyMap<string, PackedResupplyLines | null>> {
    return Promise.resolve(new Map(resupplyIds.map((id) => [id, this.packed.get(id) ?? null])));
  }
}

/** Le contenu réel des réassorts, sur des doublés — sans rien, aucun réassort n'est connu. */
export function resupplyContentsOver(
  frozen: readonly FrozenResupply[] = [],
  packed: ReadonlyMap<string, PackedResupplyLines> = new Map(),
): TransferResupplyContents {
  return new TransferResupplyContents(
    new FixedFrozenResupplies(frozen),
    new FixedPackedResupplies(packed),
  );
}

/** Un réassort de croissants figé pour Val Village (`site_vv`). */
export function frozenResupply(
  resupplyId: string,
  serviceDay: string,
  options: {
    readonly siteId?: string;
    readonly siteLabel?: string | null;
    readonly servedByTransfer?: boolean;
    readonly quantity?: number;
  } = {},
): FrozenResupply {
  return {
    resupplyId,
    serviceDay,
    siteId: options.siteId ?? "site_vv",
    siteLabel: options.siteLabel === undefined ? "Val Village" : options.siteLabel,
    servedByTransfer: options.servedByTransfer ?? true,
    lines: [{ sku: "CRO-001", productName: "Croissant", quantity: options.quantity ?? 6 }],
  };
}
