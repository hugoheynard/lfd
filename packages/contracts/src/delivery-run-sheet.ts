import type { BillingAddressPayload, DeliveryContact, GpsPoint } from "./address.js";
import type {
  HandoverQueueState,
  HandoverQueueWindowView,
  OrderClientele,
} from "./order-handover.js";

/**
 * **La feuille de route du jour** — ce qui part en livraison, et comment livrer
 * chaque adresse (`documentation/livraisons/plan-preparation-de-tournee.md`,
 * lot 1).
 *
 * Lecture seule. **Aucun montant** : un livreur n'en voit pas plus qu'un
 * opérateur de comptoir, et un total affiché ici serait lu comme une somme à
 * encaisser à la porte.
 */
export interface DeliveryRunSheetView {
  /** Jour de service, `AAAA-MM-JJ`. */
  readonly day: string;
  /** Les livraisons du jour, dans l'ordre de la base — l'écran trie. */
  readonly stops: readonly DeliveryRunSheetStopView[];
}

/** Un arrêt : une commande livrée ce jour-là. */
export interface DeliveryRunSheetStopView {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  /** L'enseigne, ou `null` quand elle ne dirait rien de plus. */
  readonly tradeName: string | null;
  readonly clientele: OrderClientele | null;
  /** L'adresse livrée, FIGÉE à la commande. `null` sur une commande qui n'en porte pas. */
  readonly address: BillingAddressPayload | null;
  /** La fenêtre convenue, avec sa provenance (`default` n'est pas une promesse). */
  readonly window: HandoverQueueWindowView | null;
  /** Le contact convenu, figé à la commande. */
  readonly contact: DeliveryContact | null;
  /** La signature convenue, figée à la commande. */
  readonly signatureRequired: boolean;
  /** La note laissée sur la commande (« par la cour »). `""` sans note. */
  readonly orderNote: string;
  /**
   * Ce que dit l'ADRESSE du carnet, lu aujourd'hui — pas figé : une consigne
   * corrigée hier doit servir ce matin.
   *
   * 🔴 `null` quand la commande n'est pas reliée à une adresse du carnet :
   * commande sans société, adresse saisie librement, ou commande passée avant
   * que le lien soit écrit (2026-09-29). L'écran le dit, il ne devine pas.
   */
  readonly addressBook: DeliveryRunSheetAddressBookView | null;
  /** Somme des quantités — ce qu'on recompte au chargement. */
  readonly totalUnits: number;
  /** Le même état que la file du comptoir. */
  readonly state: HandoverQueueState;
  /** Colisée (le bac est fait) le, ou `null`. */
  readonly readyAt: string | null;
  /**
   * 🔴 **Sans feuille d'atelier** : passée après la clôture de la journée, elle
   * n'a ni bac planifié ni QR. C'est le sac qu'on oublie le plus.
   */
  readonly withoutAtelierSheet: boolean;
  readonly placedAt: string;
}

/** Les consignes vivantes de l'adresse livrée. */
export interface DeliveryRunSheetAddressBookView {
  readonly companyId: string;
  readonly addressId: string;
  /** La note livreurs de l'adresse. `""` sans note. */
  readonly note: string;
  readonly gps: GpsPoint | null;
  /** Les étapes de la procédure, dans l'ordre. Vide sans procédure. */
  readonly procedure: readonly DeliveryRunSheetStepView[];
}

/** Une étape de procédure. La photo se lit par la route de la procédure. */
export interface DeliveryRunSheetStepView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly hasPhoto: boolean;
  /** La révision de la photo (`rev` de l'URL, comme la vue de procédure staff), `null` sans photo. */
  readonly photoRevision: string | null;
}
