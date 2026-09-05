import type { CommandBus } from "@nestjs/cqrs";

import { AcceptDeliveryCommand } from "../../src/b2b/catalog/application/commands/accept-delivery.command.js";
import type { CatalogDeliveryRepository } from "../../src/b2b/catalog/domain/ports/catalog-delivery.repository.js";
import type { B2bCatalogPushService } from "../../src/pim/channels/b2b-platform/products/push.service.js";

/**
 * **Le push vers la plateforme** — la dernière phase, et celle qui manquait.
 *
 * ## Pourquoi elle appartient au seed
 *
 * Sans elle, le seed produit un référentiel juste et un miroir B2B **périmé** :
 * les fiches sont ouvertes, décrites, signées et mises en vente, et la boutique
 * continue de servir ce que le dernier push lui avait laissé. C'est exactement
 * le piège que `b2b-channel.ts` décrit un cran plus tôt — un désaccord entre
 * deux états qui ressemble à une panne du canal.
 *
 * Le cas s'est présenté : le corpus porte 82 lignes de vitrine, le référentiel
 * les avait toutes, et `GET /shop/catalogue` en rendait **zéro**. Rien n'était
 * cassé ; personne n'avait poussé.
 *
 * ## Et pourquoi elle VALIDE l'arrivée
 *
 * Un push ne met rien en rayon : il dépose une livraison `pending` dans la
 * boîte de réception, qu'un membre du personnel relit et accepte. C'est la
 * moitié « la plateforme accueille et ALTÈRE » du fil, et elle est voulue — le
 * miroir n'avale pas ce que le référentiel envoie.
 *
 * Sur un poste de développement, personne ne relit. S'arrêter au dépôt laisse
 * donc exactement l'état qu'on vient de décrire — un référentiel juste, une
 * boutique périmée — avec une boîte de réception en plus pour le cacher. Le
 * seed valide donc, en passant par la MÊME commande que l'écran, et il le dit
 * dans sa sortie.
 *
 * ## Ce qu'elle n'est pas
 *
 * Une écriture directe dans le miroir. Elle appelle le service que l'écran
 * appelle, en mode réel — même projection, même journal, mêmes exclusions.
 * Ce qui est écarté est **rapporté**, comme les refus du rejeu : un article
 * qu'aucune vitrine ne montrera doit se voir dans la sortie du seed, pas se
 * découvrir en ouvrant la boutique.
 */
export interface PushReport {
  readonly candidates: number;
  readonly acceptedProducts: number;
  readonly acceptedVariants: number;
  readonly removed: readonly string[];
  readonly excluded: readonly string[];
  readonly revisionId: string | null;
  /** L'arrivée validée — `null` quand le push n'en a déposé aucune. */
  readonly acceptedDeliveryId: string | null;
}

/** Qui valide. Nommé pour être reconnu dans le journal, comme le reste du seed. */
const SEED_REVIEWER = "seed-pim";

export async function pushToPlatform(
  push: B2bCatalogPushService,
  deliveries: CatalogDeliveryRepository,
  commands: CommandBus,
): Promise<PushReport> {
  // `false` : un envoi réel. Une simulation laisserait le miroir dans l'état
  // qu'on vient de constater faux, en affichant un compte rassurant.
  const summary = await push.push(false);
  // Rien n'est ÉCARTÉ : le seed valide ce qu'il vient d'envoyer. Écarter
  // demanderait un jugement, et il n'y a personne pour le porter ici.
  const pending = await deliveries.pending();
  if (pending !== null) {
    await commands.execute<AcceptDeliveryCommand, void>(
      new AcceptDeliveryCommand(pending.id, [], SEED_REVIEWER),
    );
  }
  return {
    acceptedDeliveryId: pending?.id ?? null,
    candidates: summary.candidates,
    acceptedProducts: summary.report?.acceptedProducts ?? 0,
    acceptedVariants: summary.report?.acceptedVariants ?? 0,
    removed: summary.report?.removedSkus ?? [],
    excluded: summary.excluded.map((one) => `${one.sku} — ${one.reason}`),
    revisionId: summary.revisionId,
  };
}
