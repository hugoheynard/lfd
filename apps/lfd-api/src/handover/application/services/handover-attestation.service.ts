import type { OrderHandoverView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { DurableFact } from "../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import { OrderHandedOverEvent } from "../../channels/commerce/order-handed-over.event.js";
import { OrderHandover } from "../../domain/entities/order-handover.js";
import { HandoverRefusedError } from "../../domain/errors/handover-errors.js";
import { OrderHandoverRepository } from "../../domain/ports/order-handover.repository.js";
import type { HandoverVia } from "../../domain/services/handover.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { authorsOf, toHandoverView } from "../queries/get-handover.handler.js";
import { QualityHoldsReader } from "../../../production/channels/handover/index.js";
import { isHeldForQuality } from "./quality-hold.js";

/**
 * **Graver un retrait** — le geste commun au scan et à la saisie.
 *
 * ## Pourquoi un service, et pas deux handlers qui se ressemblent
 *
 * Ce qui distingue les deux portes tient en un mot : `scan` ou `manual`. Tout le
 * reste est identique — la même règle d'état, le même arbitrage de course, le
 * même fait publié, la même identité prise sur la session.
 *
 * La version précédente, chez le commerce, dupliquait ce corps dans les deux
 * handlers, et son propre JSDoc nommait le risque : « c'est ce qui évite qu'un
 * champ ajouté un jour ne soit posé que d'un côté ». Le déménagement est le bon
 * moment pour cesser de compter sur la vigilance.
 *
 * Chaque handler garde donc **sa** responsabilité — résoudre le sujet, par jeton
 * ou par numéro, et refuser si le sujet n'existe pas —, et délègue le reste.
 *
 * ## L'attestation et son fait, dans la MÊME transaction (depuis le 2026-10-04)
 *
 * L'écriture de l'attestation et celle de `handover.handed_over` dans la boîte
 * d'envoi partent ensemble, ou aucune (plan
 * `documentation/journalisation/plan-evenements-durables.md`, E2). Il y a trois
 * émetteurs, et tous passent ici : le scan et la saisie au comptoir (`attest`,
 * qui ouvre son unité de travail), la remise à la porte (`attestQuietly` et
 * `reannounce`, qui rejoignent celle du livreur). Plus rien ne part sur le bus
 * en mémoire pour ce fait.
 */
@Injectable()
export class HandoverAttestation {
  constructor(
    private readonly handovers: OrderHandoverRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly staffAuthors: StaffAuthorDirectory,
    private readonly holds: QualityHoldsReader,
  ) {}

  /**
   * Atteste, écrit le fait, et rend l'attestation obtenue — au comptoir.
   *
   * Rendre une vue depuis une écriture est assumé, comme au comptoir d'avant :
   * la confirmation doit s'afficher dans la seconde où le client attend son sac,
   * sans un second aller-retour. Ce n'est pas un modèle de lecture déguisé —
   * c'est l'accusé de réception de l'écriture.
   *
   * @throws {HandoverRefusedError} l'état l'interdit, ou un autre poste a gagné.
   */
  async attest(subject: HandoverSubject, by: string, via: HandoverVia): Promise<OrderHandoverView> {
    let handover: OrderHandover;
    try {
      // Le fait n'est écrit que par le GAGNANT : le perdant lève dans l'unité,
      // qui annule tout — sa violation d'unicité a de toute façon condamné la
      // transaction.
      handover = await this.uow.run(() => this.engrave(subject, by, via));
    } catch (error) {
      // 🔴 **Le geste est refusé, la propagation est réparée.** Les deux ne sont
      // pas la même question : le sac est peut-être parti (rien à refaire), sans
      // que le commerce l'ait appris (tout à refaire). La boîte d'envoi reprend
      // désormais un abonné qui échoue ; ceci reste le filet humain, notamment
      // pour un retrait attesté avant le 2026-10-04, dont le fait en mémoire
      // perdu n'a aucune ligne à rejouer.
      //
      // On réannonce l'attestation EXISTANTE, relue après l'annulation — jamais
      // la nôtre : l'heure et l'auteur sont ceux du vrai retrait, et un perdant
      // de course trouve ainsi celle du gagnant. Puis le refus part tel quel :
      // c'est l'agrégat qui choisit le mot, et « annulée » explique la situation
      // mieux que « déjà retirée » quand les deux sont vraies.
      if (error instanceof HandoverRefusedError) {
        await this.uow.run(async () => {
          await this.reannounceExisting(subject.orderId);
        });
      }
      throw error;
    }

    // Gagnée, l'attestation fait dire « déjà retirée » à la règle : la retenue
    // n'a plus rien à ajouter à l'accusé.
    return toHandoverView(subject, handover, false, await authorsOf(this.staffAuthors, handover));
  }

  /**
   * **Atteste dans l'unité de travail de l'appelant** (`a-la-porte.md`, B1,
   * AP-D1) — la remise à la porte, dans celle du livreur : la même règle, le
   * même arbitrage de course, et le fait écrit dans la même transaction que la
   * clôture de l'arrêt. Une clôture qui échoue n'écrit donc ni attestation, ni
   * fait. Un refus ne réannonce rien ici : l'unité échoue en entier.
   *
   * @throws {HandoverRefusedError} l'état l'interdit, ou un autre poste a gagné.
   */
  async attestQuietly(
    subject: HandoverSubject,
    by: string,
    via: HandoverVia,
  ): Promise<OrderHandover> {
    return this.uow.run(() => this.engrave(subject, by, via));
  }

  /**
   * Réannonce une attestation déjà gravée — un fait NEUF, sans rien réécrire.
   * Rejoint l'unité de travail de l'appelant (le rejeu d'un arrêt à la porte).
   */
  async reannounce(handover: OrderHandover): Promise<void> {
    await this.uow.run(() => this.durable.publish(factOf(handover, this.clock.now())));
  }

  private async engrave(
    subject: HandoverSubject,
    by: string,
    via: HandoverVia,
  ): Promise<OrderHandover> {
    // 🔴 La retenue est lue ici, AVANT l'écriture et sans verrou commun avec le
    // contrôle : un blocage rendu dans l'intervalle laisse partir le sac. C'est
    // une vérification, pas une interdiction — assumé au plan
    // (`plan-controle-qualite.md`, D4, « La course »).
    const [existing, qualityHold] = await Promise.all([
      this.handovers.findByOrderId(subject.orderId),
      isHeldForQuality(this.holds, subject),
    ]);
    const at = this.clock.now();

    // L'agrégat refuse ici — commande annulée, pas encore passée, déjà
    // retirée, retenue au contrôle.
    const handover = OrderHandover.attest(
      subject,
      { handedOverAt: existing === null ? null : existing.handedOverAt, qualityHold },
      at,
      by,
      via,
    );

    const won = await this.handovers.attest(handover);
    if (!won) {
      // Perdu la course : un autre poste a scanné, ou saisi, entre notre lecture
      // et notre écriture. On ne réécrit rien — l'attestation de l'autre est la
      // seule vraie, et elle est peut-être la FORTE —, et on lève : l'unité de
      // travail est déjà condamnée par la violation d'unicité.
      throw new HandoverRefusedError("Cette commande vient d'être retirée à un autre poste.");
    }

    await this.durable.publish(factOf(handover, null));
    return handover;
  }

  /**
   * Réannonce l'attestation en base, ou ne fait rien s'il n'y en a pas.
   *
   * Sans danger, et c'est ce qui permet de l'appeler sur tous les refus sans y
   * réfléchir : `markFulfilled` est conditionné par `handedOverAt: null` côté
   * commerce, donc un fait rejoué qui a déjà été traité n'écrit rien et
   * n'écrit pas de second `order.fulfilled` — ni point, ni ligne de journal.
   */
  private async reannounceExisting(orderId: string): Promise<void> {
    const existing = await this.handovers.findByOrderId(orderId);
    if (existing !== null) {
      await this.durable.publish(factOf(existing, this.clock.now()));
    }
  }
}

/** Le fait d'une attestation — son heure et son auteur, jamais ceux d'un rescan. */
function factOf(handover: OrderHandover, reannouncedAt: Date | null): DurableFact {
  return new OrderHandedOverEvent(
    handover.orderId,
    handover.reference,
    handover.handedOverAt,
    handover.handedOverBy,
    handover.via,
    reannouncedAt,
  ).durableFact();
}
