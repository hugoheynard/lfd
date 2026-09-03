import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { B2bPushChange, B2bPushPreviewItem, B2bPushPreviewView } from "@lfd/contracts";

import type { ParityReport } from "../../domain/catalog-parity.js";
import { CheckCatalogParityService } from "../check-catalog-parity.service.js";
import { PreviewCatalogPushQuery } from "./preview-catalog-push.query.js";

/**
 * Assemble l'aperçu d'envoi : ce qui partirait, ce que ça changerait au canal,
 * ce que ça en retirerait.
 *
 * Tout vient d'une **seule** confrontation — projection et miroir lus ensemble.
 * Deux lectures séparées donneraient un écart calculé sur un état, une empreinte
 * calculée sur un autre, et un écran qui montre l'un en envoyant l'autre.
 */
@QueryHandler(PreviewCatalogPushQuery)
export class PreviewCatalogPushHandler implements IQueryHandler<
  PreviewCatalogPushQuery,
  B2bPushPreviewView
> {
  constructor(private readonly parity: CheckCatalogParityService) {}

  async execute(): Promise<B2bPushPreviewView> {
    const { preview, reference, parity } = await this.parity.confront();
    const changes = changeIndex(parity);

    return {
      outgoing: reference.map((entry): B2bPushPreviewItem => ({
        sku: entry.sku,
        name: entry.name,
        priceMillicents: entry.priceMillicents,
        vatRatePercent: entry.vatRate,
        change: changes.get(entry.sku) ?? "unchanged",
      })),
      candidates: preview.candidates,
      excluded: preview.excluded.map((exclusion) => ({
        sku: exclusion.sku,
        reason: exclusion.reason,
      })),
      // Le retrait est l'autre moitié de l'envoi, et la simulation ne pouvait
      // pas la voir : elle seule suppose de connaître l'état du canal.
      removed: parity.stale,
      fingerprint: preview.fingerprint,
      parity,
    };
  }
}

/**
 * L'effet de l'envoi sur chaque article, dérivé de l'écart.
 *
 * `missing` — le canal ne l'a pas — est une ENTRÉE. Un écart de prix, de taux ou
 * de nom est un CHANGEMENT. Le reste ne bouge pas, et c'est le cas courant :
 * un envoi qui ne change rien est un envoi normal, pas un envoi vide.
 *
 * L'ordre compte : une entrée n'est pas aussi un changement, et l'écrire après
 * les écarts la ferait rétrograder sur un article dont le prix diffère — ce qui
 * arrive toujours, puisqu'il n'a pas de prix côté canal.
 */
function changeIndex(parity: ParityReport): ReadonlyMap<string, B2bPushChange> {
  const changes = new Map<string, B2bPushChange>();
  for (const gap of [...parity.priceGaps, ...parity.vatGaps, ...parity.nameGaps]) {
    changes.set(gap.sku, "changed");
  }
  for (const sku of parity.missing) {
    changes.set(sku, "added");
  }
  return changes;
}
