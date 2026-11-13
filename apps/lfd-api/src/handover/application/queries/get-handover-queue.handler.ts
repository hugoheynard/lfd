import type { HandoverQueueView, VersionSubject } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DayContents } from "../../../platform/day-versions/day-contents.js";
import { VersionRegistry } from "../../../platform/day-versions/version-registry.js";
import { HandoverQueueReading } from "../services/handover-queue-reading.service.js";
import { GetHandoverQueueQuery } from "./get-handover-queue.query.js";
import {
  HANDOVER_QUEUE_SCREENS,
  isHandoverQueueContent,
  isStorableHandoverQueue,
} from "./handover-queue-content.js";

/**
 * Les sujets dont la file lit les tables : le commerce (`orders` — la
 * commande, son règlement, son retrait, écrits dans la même transaction),
 * le fournil (`production` — les retenues qualité, le prêt du colisage), la
 * livraison (`delivery` — transferts, réassort, place en tournée) et le
 * sujet GLOBAL `companies` : la ligne porte la raison sociale, l'enseigne et
 * le nom de qui a commandé (`handover-order.query.ts`), que le journal des
 * comptes suit (`companies`, `users`).
 */
const HANDOVER_QUEUE_SUBJECTS: readonly VersionSubject[] = [
  "orders",
  "production",
  "delivery",
  "companies",
];

/**
 * **La file du retrait d'une journée, servie depuis l'objet des journées**
 * tant que ses numéros ne bougent pas (`le-cache-du-back-office.md`, § 3.4).
 * Une clé par périmètre posé par la route : `handover-counter` (le comptoir,
 * retraits seuls) et `handover-day` (la Supervision, journée entière).
 *
 * 🔴 Les numéros sont lus EN BASE, AVANT les données : une écriture validée
 * entre les deux fait monter un numéro après celui de l'étiquette, et le
 * veilleur de l'écran fait relire. Lus après, ils couvriraient une écriture
 * que le contenu n'a pas — servie vieille jusqu'au numéro suivant.
 *
 * Rien n'y dépend de l'heure : la vue rangée est servie telle quelle. Lu
 * hors journal, accepté vieux jusqu'au prochain numéro (Hugo, 2026-11-13) :
 * le libellé d'un site de transfert.
 */
@QueryHandler(GetHandoverQueueQuery)
export class GetHandoverQueueHandler implements IQueryHandler<
  GetHandoverQueueQuery,
  HandoverQueueView
> {
  constructor(
    private readonly subjects: VersionRegistry,
    private readonly contents: DayContents,
    private readonly reading: HandoverQueueReading,
  ) {}

  async execute(query: GetHandoverQueueQuery): Promise<HandoverQueueView> {
    const versions = await this.subjects.versionsOf(HANDOVER_QUEUE_SUBJECTS, query.day);
    return this.contents.contentOf(
      { screen: HANDOVER_QUEUE_SCREENS[query.scope], day: query.day, versions },
      () => this.reading.contentOf(query.day, query.scope),
      { accepts: isHandoverQueueContent, storable: isStorableHandoverQueue },
    );
  }
}
