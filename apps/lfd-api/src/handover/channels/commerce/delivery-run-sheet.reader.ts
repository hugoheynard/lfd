import type { BillingAddressPayload, DeliveryContact, GpsPoint } from "@lfd/contracts";

import type { HandoverWindow } from "./handover-queue.reader.js";

/**
 * **Ce qui part en livraison ce jour-là, et comment livrer chaque adresse** —
 * la feuille de route, telle que le commerce la connaît
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 1).
 *
 * ## Pourquoi ce n'est PAS un jumeau de `HandoverQueueReader`
 *
 * La conception v1 (§8) interdit un second lecteur de file : deux lectures de
 * « ce qui est attendu aujourd'hui » rouvriraient deux vérités. Ce port ne
 * rouvre rien, parce que la vérité n'est pas dans le port mais dans le **filtre**,
 * et le filtre est UN : l'adaptateur lit `expectedOnWhere` — le même que la file
 * — puis n'ajoute que « en livraison ». Une commande est sur la feuille de route
 * si, et seulement si, elle est dans la file du comptoir en coursier.
 *
 * Ce qui justifie deux ports, c'est le **prix** : la feuille de route lit
 * l'adresse livrée, le contact, la note, les consignes du carnet et la procédure
 * — deux jointures et un JSON de plus par ligne. Étendre la file les ferait payer
 * au comptoir, qui recharge sa file toute la matinée et n'en lit rien. ISP : le
 * comptoir ne dépend que de ce qu'il affiche.
 *
 * Les états (retirée, annulée, prête) se calculent en aval, par la même
 * fonction que la file (`queueStateOf`) : c'est l'autre moitié de « pas de
 * seconde vérité ».
 */
export abstract class DeliveryRunSheetReader {
  /**
   * Les commandes en LIVRAISON attendues ce jour-là, brouillons écartés,
   * annulées rendues — exactement la file du comptoir, restreinte au coursier.
   *
   * @param day Jour de service `AAAA-MM-JJ` (`requested_delivery_date`).
   */
  abstract deliveriesOn(day: string): Promise<readonly DeliveryRunSheetEntry[]>;

  /**
   * Ces commandes-là, quel que soit leur jour demandé — en livraison,
   * brouillons écartés, annulées rendues ; les autres sont absentes. Les
   * mêmes lignes que {@link deliveriesOn}, sous le même mur d'adresse.
   *
   * Pourquoi par identifiants : une commande RAPPORTÉE peut être replacée
   * dans une tournée d'un autre jour que sa date demandée
   * (`decisions-par-defaut-2026-10-02.md`, § 4), et ce qui la place est la
   * composition des tournées — un fait de la livraison, que ni la remise ni
   * le commerce ne lisent. L'écran qui joint les deux nomme donc ces
   * commandes ; aucun jour ne les retrouverait.
   */
  abstract deliveriesAmong(orderIds: readonly string[]): Promise<readonly DeliveryRunSheetEntry[]>;
}

/** Un arrêt de la feuille de route. **Aucun montant.** */
export interface DeliveryRunSheetEntry {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  /** Même règle que {@link HandoverQueueEntry.tradeName}. */
  readonly tradeName: string | null;
  readonly clientele: "pro" | "public" | null;
  /** L'adresse livrée, figée à la commande. `null` si le snapshot est absent ou illisible. */
  readonly address: BillingAddressPayload | null;
  readonly window: HandoverWindow | null;
  /** Le contact convenu, figé à la commande. */
  readonly contact: DeliveryContact | null;
  readonly signatureRequired: boolean;
  /** La note de la commande. `""` sans note. */
  readonly orderNote: string;
  /**
   * Ce que dit l'adresse du carnet AUJOURD'HUI, ou `null` sans lien.
   *
   * 🔴 Lu uniquement quand l'adresse appartient à la société de la commande :
   * un lien vers le carnet d'une autre maison rend `null`, jamais ses consignes.
   */
  readonly addressBook: DeliveryRunSheetAddressBook | null;
  readonly totalUnits: number;
  /** L'état côté COMMERCE, lu par la règle d'état — jamais écrit par le retrait. */
  readonly status: string;
  readonly readyAt: Date | null;
  readonly placedAt: Date;
}

/** Les consignes vivantes de l'adresse livrée. */
export interface DeliveryRunSheetAddressBook {
  readonly companyId: string;
  readonly addressId: string;
  /** `""` sans note, ou quand les consignes stockées sont illisibles. */
  readonly note: string;
  readonly gps: GpsPoint | null;
  /** Le temps de livraison sur place de l'adresse, en minutes ; `null` : le réglage global (L7b-C4). */
  readonly stopMinutes: number | null;
  /** Dans l'ordre de passage. Vide sans procédure. */
  readonly procedure: readonly DeliveryRunSheetStep[];
}

/** Une étape de procédure. La clé de photo ne sort pas : sa présence et sa révision seulement. */
export interface DeliveryRunSheetStep {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly hasPhoto: boolean;
  /** Ce qui invalide l'image en cache — la même révision que la procédure staff. */
  readonly photoRevision: string | null;
}
