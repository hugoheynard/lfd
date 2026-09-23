import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MediaUploadFailureView } from "@lfd/pim-contracts";

import { MediaFailureLog, type LoggedFailure } from "../domain/ports/media-failure-log.js";

/**
 * Assez pour couvrir plusieurs lots, pas assez pour faire une page d'archive.
 *
 * L'historique répond à « qu'est-ce qui n'est pas entré récemment » ; au-delà,
 * le fichier n'existe plus sur le disque de personne et la ligne n'apprend
 * plus rien.
 */
const MAX_FAILURES = 200;
const DEFAULT_FAILURES = 50;

/** Les derniers dépôts refusés, du plus récent au plus ancien. */
export class ReadUploadFailuresQuery {
  constructor(readonly limit: number = DEFAULT_FAILURES) {}
}

/**
 * **L'historique des dépôts refusés.**
 *
 * 🔴 Il existe parce que le compte rendu d'un lot vivait en MÉMOIRE : fermer
 * l'onglet l'effaçait, et personne ne pouvait dire le lendemain ce qui
 * n'était pas entré la veille.
 *
 * ⚠️ **Ce qu'il ne permet pas : rejouer.** Un fichier refusé n'a pas été
 * stocké — il n'y a pas d'octets à renvoyer. Cette lecture dit QUOI retrouver
 * et POURQUOI ça a échoué ; la file en mémoire de l'écran reste le seul
 * endroit d'où « Réessayer » est possible.
 */
@QueryHandler(ReadUploadFailuresQuery)
export class ReadUploadFailuresHandler implements IQueryHandler<
  ReadUploadFailuresQuery,
  readonly MediaUploadFailureView[]
> {
  constructor(private readonly failures: MediaFailureLog) {}

  async execute(query: ReadUploadFailuresQuery): Promise<readonly MediaUploadFailureView[]> {
    // Borné ICI comme la bibliothèque, et pour la même raison : le contrôleur
    // peut se tromper, un test aussi.
    const limit = Math.min(Math.max(Math.trunc(query.limit), 1), MAX_FAILURES);
    const rows = await this.failures.recent(limit);
    return rows.map(viewOf);
  }
}

function viewOf(failure: LoggedFailure): MediaUploadFailureView {
  return {
    id: failure.id,
    fileName: failure.fileName,
    reason: failure.reason,
    code: failure.code,
    bytes: failure.bytes,
    contentType: failure.contentType,
    actorName: failure.actorName,
    // ISO, et pas un `Date` : ce qui sort d'ici est du JSON, et laisser Nest
    // sérialiser à notre place rendrait la forme dépendante de son réglage.
    occurredAt: failure.occurredAt.toISOString(),
  };
}
