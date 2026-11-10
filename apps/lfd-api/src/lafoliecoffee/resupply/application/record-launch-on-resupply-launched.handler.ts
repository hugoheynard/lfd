import { Injectable, Logger } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  PRODUCTION_RESUPPLY_LAUNCHED,
  ResupplyLaunchedEvent,
} from "../../../production/channels/commerce/index.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_LAUNCH_ON_RESUPPLY_LAUNCHED = "b2b.resupply-launch-on-resupply-launched";

/**
 * **Le fournil a lancé un réassort « au plus tôt » : l'écran le dit** (R4a,
 * `reassort-boutiques/au-plus-tot.md`). Pose « Lancé par X à HH:MM »
 * sur le réassort, à l'instant et au nom du lancement, jamais à ceux de la
 * livraison du fait.
 *
 * Un AFFICHAGE, rien de plus : le refus d'annuler un réassort lancé ne lit
 * pas cette colonne, il demande au fournil sous le verrou de la journée
 * (`LaunchedResupplies`). Le fait arrive après la validation du lancement ;
 * l'écran peut donc dire « envoyé » un instant de plus — jamais l'inverse.
 *
 * Abonné DURABLE (`lint:durable-cross-block`). Rejoué, il ne pose rien de
 * plus (`recordLaunch` rend `false`). Un réassort introuvable sous son point,
 * ou qui n'est plus un « au plus tôt » envoyé, est écarté et journalisé (le
 * rejeu d'un lancement déjà affiché, lui, est silencieux) :
 * lever ferait relivrer le fait jusqu'à épuiser ses dix essais
 * (`MAX_DELIVERY_ATTEMPTS`, vérifié le 2026-11-02), puis le laisserait en
 * échec, pour un affichage sans objet. Un conflit de version, lui, lève :
 * il est transitoire, et l'essai suivant le résout.
 */
@Injectable()
@DurableHandler({
  type: PRODUCTION_RESUPPLY_LAUNCHED,
  subscriber: RECORD_LAUNCH_ON_RESUPPLY_LAUNCHED,
})
export class RecordLaunchOnResupplyLaunched implements DurableSubscriber {
  private readonly logger = new Logger(RecordLaunchOnResupplyLaunched.name);

  constructor(private readonly resupplies: SiteResupplyRepository) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = ResupplyLaunchedEvent.fromPayload(delivery.payload);
    const { siteId, resupplyId } = fact.resupply;
    const resupply = await this.resupplies.load(siteId, resupplyId);
    if (resupply === null) {
      this.logger.warn(
        `Réassort ${resupplyId} lancé au fournil pour le point ${siteId} : introuvable sous ce ` +
          `point, « lancé » n'est pas affiché.`,
      );
      return;
    }
    const replayed = resupply.launched !== null;
    if (resupply.recordLaunch({ at: fact.launchedAt, byName: fact.launchedByName })) {
      await this.resupplies.save(resupply);
    } else if (!replayed) {
      // Annulé, sortie de réserve, « pour demain » : la promesse « écarté ET
      // journalisé » ne valait que pour l'introuvable (audit final, 2026-11-03).
      this.logger.warn(
        `Réassort ${resupplyId} lancé au fournil pour le point ${siteId} : il n'est pas un ` +
          `« au plus tôt » envoyé (état ${resupply.status}, origine ${resupply.origin}), ` +
          `« lancé » n'est pas affiché.`,
      );
    }
  }
}
