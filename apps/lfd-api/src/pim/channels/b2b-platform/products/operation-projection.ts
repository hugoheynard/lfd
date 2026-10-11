import type { SyncOperation } from "@lfd/catalog-sync";
import type { B2bExclusionReason, LocalizedText } from "@lfd/pim-contracts";

import type { OperationSnapshot } from "../../../operations/domain/entities/operation.js";

/** Le motif d'un article de sélection qui ne part pas. Nommé une fois, lu par les tests. */
export const OPERATION_SKU_NOT_SHIPPED: B2bExclusionReason = "operation_article_absent";

/** Ce que les opérations ajoutent à un envoi : elles, et les articles de sélection écartés. */
export interface OperationProjection {
  readonly operations: readonly SyncOperation[];
  readonly excluded: readonly { readonly sku: string; readonly reason: B2bExclusionReason }[];
}

/**
 * **Les opérations datées, telles que le fil v11 les porte** (D10 de
 * `documentation/operations-datees/architecture-operations-datees.md`). Pure, comme
 * `projectCatalog` : aucune base, aucune horloge.
 *
 * Deux filtres, et chacun a sa raison :
 *
 * - **une opération archivée ne part pas.** Le récepteur la marquera retirée
 *   — jamais effacée : sa clé ne se réemploie pas, et sa surcharge garde son
 *   parent ;
 * - **un SKU de sélection que l'envoi ne porte pas ne part pas non plus**, et
 *   il est NOMMÉ. Non publié, sans prix, canal fermé : le récepteur ne le
 *   connaîtrait pas, et une bûche absente du rayon de Noël sans que personne
 *   sache pourquoi est exactement ce que les exclusions existent pour dire.
 *
 * Un SKU écarté de deux opérations n'est nommé qu'une fois : la ligne dit
 * « cet article ne part pas », pas « il manque ici et là ».
 *
 * L'ordre des opérations est celui du lecteur (annonce la plus récente
 * d'abord) ; celui des SKU, l'ordre du rayon, est conservé.
 */
export function projectOperations(
  operations: readonly OperationSnapshot[],
  shippedSkus: ReadonlySet<string>,
): OperationProjection {
  const missing = new Set<string>();
  const projected = operations
    .filter((operation) => operation.archivedAt === null)
    .map((operation) => {
      const skus = operation.skus.filter((sku) => {
        if (shippedSkus.has(sku)) {
          return true;
        }
        missing.add(sku);
        return false;
      });
      return toSync(operation, skus);
    });
  return {
    operations: projected,
    excluded: [...missing].map((sku) => ({ sku, reason: OPERATION_SKU_NOT_SHIPPED })),
  };
}

function toSync(operation: OperationSnapshot, skus: readonly string[]): SyncOperation {
  const { schedule } = operation;
  return {
    key: operation.key,
    name: textOf(operation.name),
    lede: operation.lede === null ? null : textOf(operation.lede),
    image: operation.image === null ? null : { url: operation.image.url, alt: operation.image.alt },
    announceFrom: schedule.announceFrom.toISOString(),
    orderFrom: schedule.orderFrom === null ? null : schedule.orderFrom.toISOString(),
    orderUntil: schedule.orderUntil.toISOString(),
    // Des JOURS, tels quels : aucun fuseau n'y entre, la traduction en instant
    // appartient au lecteur (`localToInstant`).
    pickupFrom: schedule.pickupFrom.value,
    pickupUntil: schedule.pickupUntil.value,
    audience: operation.audience,
    skus: [...skus],
  };
}

/** Un point focal tel que la médiathèque le décrit : deux fractions de 0 à 1. */
export interface OperationImageFocal {
  readonly x: number;
  readonly y: number;
}

/**
 * **Le point focal des images d'opération**, posé sur une projection déjà
 * faite (cf. `documentation/mediatheque/mediatheque.md` §7 bis,
 * 2026-10-11). Pure : les points sont lus à la médiathèque par l'appelant,
 * AU PUSH. Entre deux push, un remplacement ou une redescription suivent par
 * le fait `pim.operation_image_changed` (`operations/application/
 * on-media-asset-described.ts`).
 *
 * Une image que la médiathèque ne connaît pas, ou dont personne n'a posé le
 * point, part avec `focal: null` : la bannière recadre au centre.
 */
export function focusOperations(
  operations: readonly SyncOperation[],
  focals: ReadonlyMap<string, OperationImageFocal | null>,
): SyncOperation[] {
  return operations.map((operation) =>
    operation.image === null
      ? operation
      : {
          ...operation,
          image: { ...operation.image, focal: focals.get(operation.image.url) ?? null },
        },
  );
}

/**
 * Le texte localisé, **langues présentes seulement** : le fil refuse une clé
 * `en: undefined` qu'un décompte d'objets lirait comme une traduction.
 */
function textOf(text: LocalizedText): SyncOperation["name"] {
  return {
    fr: text.fr,
    ...(text.en === undefined ? {} : { en: text.en }),
    ...(text.it === undefined ? {} : { it: text.it }),
  };
}
