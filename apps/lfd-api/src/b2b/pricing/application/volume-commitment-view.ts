import type { VolumeCommitmentView } from "@lfd/contracts";

import type { StoredVolumeCommitment } from "./ports/volume-commitments.reader.js";

/**
 * **Un engagement, tel que l'écran de suivi le lit.**
 *
 * `orderedQuantity` est **mesuré** et passé par l'appelant : cette fonction
 * convertit un état, elle n'interroge pas les commandes. C'est aussi ce qui
 * garde le suivi honnête — le volume atteint n'est jamais dérivé de la promesse.
 *
 * `null` = rien à mesurer à cette portée, et c'est un fait distinct de zéro.
 *
 * **Dans `application/` et non dans `domain/`** : elle rend un
 * `VolumeCommitmentView`, un type du fil, et prend un `StoredVolumeCommitment`,
 * qui est la forme d'un port. Le domaine ne dépend de rien — l'y poser
 * l'aurait fait dépendre de la couche au-dessus.
 *
 * ⚠️ Elle prend l'**état** et non la ligne, là où `commitmentViewFromRow` prenait
 * la seconde. C'est ce qui a permis de sortir Prisma de la query : une ligne ne
 * franchit pas `infrastructure/` (`CLAUDE.md` §3), donc tant que la vue se
 * fabriquait depuis une ligne, la query devait la lire elle-même.
 */
export function commitmentView(
  { state, createdAt }: StoredVolumeCommitment,
  orderedQuantity: number | null,
): VolumeCommitmentView {
  return {
    id: state.id,
    companyId: state.companyId,
    scope: state.scope,
    promisedQuantity: state.promisedQuantity,
    validFrom: state.validFrom.toISOString(),
    validTo: state.validTo.toISOString(),
    createdBy: state.createdBy,
    createdAt: createdAt.toISOString(),
    archivedAt: state.archivedAt?.toISOString() ?? null,
    archivedBy: state.archivedBy,
    archiveReason: state.archiveReason,
    orderedQuantity,
  };
}
