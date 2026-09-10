/**
 * **Ce que le comptoir attend aujourd'hui** — la file, telle que le commerce la
 * connaît.
 *
 * ## Pourquoi la remise ne stocke PAS cette liste
 *
 * Parce qu'elle ne peut pas diverger. C'est de l'alimentaire : ce qui est cuit
 * est facturé, donc le contenu d'une commande **gèle quand le four démarre**, et
 * la remise a lieu après. Une copie et une lecture vive donneraient la même
 * réponse — la copie n'achèterait rien, et coûterait de suivre annulations et
 * avenants sur un bus qui n'est ni persisté ni rejoué.
 *
 * La règle du dossier : on ne copie pas pour aller plus vite ; on instantané
 * quand la copie devient un **fait distinct**. Ce que la remise stocke, c'est ce
 * que personne d'autre ne sait — l'attestation, et les états de comptoir.
 *
 * ## Ce qui suit du même raisonnement
 *
 * Le **retardataire** est ici. Une commande passée après la clôture n'est dans
 * aucun plan de production, et reste remettable — `handoverBlocker` le dit en
 * toutes lettres. Un instantané pris à la clôture l'aurait perdue ; une lecture
 * vive le rend gratuitement.
 *
 * ## Le jour où la remise devient un worker
 *
 * 🔴 C'est ce port, et non une copie, qui rend le découpage bon marché. Le
 * contrat et ses appelants ne bougeront pas : seul **l'adaptateur** deviendra un
 * appel réseau, et c'est ce jour-là — pas avant — que l'instantané à la clôture
 * gagnera une raison d'être.
 */
export abstract class HandoverQueueReader {
  /**
   * Les commandes attendues ce jour-là, tous points confondus.
   *
   * ⚠️ **Le filtrage par point de retrait se fait en aval, pas ici.** L'écran
   * montre deux onglets et un compteur par onglet : filtrer côté serveur
   * obligerait à deux appels pour peindre une page, et le second onglet
   * afficherait un nombre qu'il n'a pas encore chargé. Le volume est celui d'une
   * matinée de comptoir, pas d'un export.
   *
   * @param day Jour de service au format `AAAA-MM-JJ`, tel que le commerce le
   *   stocke (`requested_delivery_date` est un `date`, sans heure ni fuseau).
   */
  abstract expectedOn(day: string): Promise<readonly HandoverQueueEntry[]>;
}

/**
 * Une ligne de la file. **Aucun montant** : on ne facture pas au comptoir, et un
 * total affiché là serait lu comme une somme à encaisser.
 */
export interface HandoverQueueEntry {
  /** Opaque. Sert à ouvrir le bon, jamais à aller lire à côté. */
  readonly orderId: string;
  /** Le numéro lisible, celui qu'on saisit quand le code manque. */
  readonly reference: string;
  /** La raison sociale, ou la personne quand la commande est sans entreprise. */
  readonly customerLabel: string;
  /** Le point de retrait figé à la commande, ou `null` — cf. `HandoverWindow`. */
  readonly pickupLabel: string | null;
  /** L'acheminement : le coursier charge ici, le client vient ici. */
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** Le créneau convenu, ou `null` si aucun n'a été demandé. */
  readonly window: HandoverWindow | null;
  /** Somme des quantités — le chiffre qu'on recompte à voix haute. */
  readonly totalUnits: number;
  /** L'état côté COMMERCE. La règle de remise le lit, elle ne l'écrit pas. */
  readonly status: string;
  /** Quand le fournil l'a déclarée prête, ou `null` si elle ne l'est pas. */
  readonly readyAt: Date | null;
  /** Passée le — l'ordre de la file quand aucun créneau ne la départage. */
  readonly placedAt: Date;
}

/**
 * Le créneau convenu, **avec sa provenance** — et la provenance n'est pas un
 * détail.
 *
 * 🔴 `source: "default"` veut dire que la valeur vient du réglage du point de
 * retrait, recopiée à la commande : c'est une **heure d'ouverture**, pas une
 * promesse faite à quelqu'un. Calculer un « retard » dessus produirait une
 * alarme que personne n'a promise, sur toutes les commandes à la fois — le
 * backfill du 2026-08-15 a posé `source: "default"` sur l'intégralité des
 * commandes antérieures.
 *
 * Seul un `override` est une tranche réellement demandée.
 */
export interface HandoverWindow {
  /** `null` = aucune borne basse, c'est-à-dire « avant `end` ». */
  readonly start: string | null;
  /** `HH:mm`. */
  readonly end: string;
  readonly source: "default" | "override";
}
