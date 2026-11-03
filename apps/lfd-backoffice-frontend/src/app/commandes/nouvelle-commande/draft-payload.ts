import type {
  AdminPlaceOrderPayload,
  BillingAddressPayload,
  CatalogItemView,
  DeliveryAddressView,
  FulfillmentMethod,
  FulfillmentWindow,
  OrderDraftPayload,
  OrderDraftView,
  OrderLineInput,
  StaffSettlement,
} from '@lfd/contracts';

import { firstSaleQuantityOf, pieceMinimumOf, saleStepOf } from '@lfd/b2b-ui/catalog';

import { requestedLineOf, type CartLine } from './cart.store';
import { NEW_ADDRESS, type DraftSnapshot } from './draft.store';
import type { FulfillmentChoice } from './acheminement-commande/acheminement-commande';
import type { OrderEntryBuyer } from './order-entry-customer';
import type { OrderEntryOrigin } from './order-entry-origin';

/** Ce que la colonne rend au moment de valider — les lignes viennent de la page. */
export interface OrderDraft {
  readonly buyerUserId: string;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly pickupAddressId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  /** L'adresse dictée rejoint-elle le carnet du compte ? */
  readonly saveAddressToBook: boolean;
  /** Jour de retrait/livraison. Obligatoire : c'est la journée de production. */
  readonly requestedDeliveryDate: string;
  /** La tranche convenue — en retrait seul, et le panier ne part pas sans elle. */
  readonly requestedWindow: FulfillmentWindow | null;
  readonly note: string;
  readonly settlement: StaffSettlement;
  /**
   * « Retrait immédiat » (lot L6) : la page passe la commande sur le stock
   * (`supply: "shelf"`, `entryShortcut: "immediate_pickup"`), puis la remet.
   */
  readonly immediate: boolean;
}

/**
 * La traduction entre **l'écran** et le **brouillon conservé**.
 *
 * Le serveur garde des faits, pas l'état de l'écran : l'adresse **retenue**, et
 * non « la troisième du carnet ». C'est ce qui permet de reprendre un brouillon
 * après qu'une adresse a été renommée, et ce qui évite de figer une mise en page
 * dans une table. Le prix de la traduction est ici, en deux fonctions pures.
 */

/** L'adresse livrée que le brouillon doit conserver — `null` en retrait. */
function deliveryAddressOf(
  draft: DraftSnapshot,
  addresses: readonly DeliveryAddressView[],
): BillingAddressPayload | null {
  if (draft.method !== 'delivery') {
    return null;
  }
  const chosen = addresses.find((entry) => entry.id === draft.addressId) ?? addresses[0];
  const source = draft.addressId === NEW_ADDRESS || chosen === undefined ? draft.address : chosen;
  if (source.ligne1.trim() === '') {
    return null;
  }
  return {
    label: '',
    ligne1: source.ligne1.trim(),
    ligne2: source.ligne2.trim(),
    codePostal: source.codePostal.trim(),
    ville: source.ville.trim(),
    pays: 'France',
  };
}

/** Ce qu'on envoie au serveur : les lignes, et les décisions qui les entourent. */
export function draftPayloadOf(
  draft: DraftSnapshot,
  lines: readonly CartLine[],
  addresses: readonly DeliveryAddressView[],
): OrderDraftPayload {
  return {
    buyerUserId: draft.buyerUserId,
    fulfillmentMethod: draft.method,
    pickupAddressId: draft.pickupId === '' ? null : draft.pickupId,
    deliveryAddress: deliveryAddressOf(draft, addresses),
    requestedDeliveryDate: draft.requestedDate === '' ? null : draft.requestedDate,
    // La tranche convenue voyage telle quelle : le brouillon garde un fait
    // arrêté, pas une requête que le serveur devrait encore interpréter.
    requestedWindow: draft.window,
    note: draft.note,
    settlement: draft.settlement,
    // Des SKU et des quantités, **jamais de prix** : c'est le catalogue serveur
    // qui fera foi à la reprise comme à la passation.
    lines: lines.map(requestedLineOf),
  };
}

/**
 * Les décisions d'un brouillon relu, remises dans la forme de l'écran.
 *
 * L'adresse conservée est **rapprochée du carnet** par sa rue et son code postal :
 * si elle s'y trouve encore, on rouvre sur cette entrée ; sinon on rouvre la
 * saisie, garnie. Rapprocher par identifiant aurait perdu l'adresse le jour où
 * la fiche la remplace.
 */
export function draftSnapshotOf(
  view: OrderDraftView,
  addresses: readonly DeliveryAddressView[],
): DraftSnapshot {
  const kept = view.deliveryAddress;
  const known =
    kept === null
      ? undefined
      : addresses.find(
          (entry) =>
            entry.ligne1.trim() === kept.ligne1.trim() &&
            entry.codePostal.trim() === kept.codePostal.trim(),
        );
  return {
    buyerUserId: view.buyerUserId,
    method: view.fulfillmentMethod,
    pickupId: view.pickupAddressId ?? '',
    addressId: kept === null ? '' : (known?.id ?? NEW_ADDRESS),
    address: {
      ligne1: kept?.ligne1 ?? '',
      ligne2: kept?.ligne2 ?? '',
      codePostal: kept?.codePostal ?? '',
      ville: kept?.ville ?? '',
    },
    // Une adresse déjà au carnet n'a pas à y retourner ; une adresse dictée qu'on
    // avait choisi d'y mettre y est déjà, puisque la commande n'est pas passée…
    // mais elle ne l'est pas non plus. On repart donc décoché : c'est un geste
    // explicite, et le brouillon ne doit pas le prendre à la place de l'humain.
    keepAddress: false,
    window: view.requestedWindow,
    requestedDate: view.requestedDeliveryDate ?? '',
    note: view.note,
    settlement: view.settlement,
  };
}

/** Les lignes d'un brouillon, **re-résolues au catalogue du jour**. */
export interface RestoredLines {
  readonly lines: readonly CartLine[];
  /** Les SKU que le catalogue ne connaît plus — l'écran le dit, il ne l'invente pas. */
  readonly dropped: readonly string[];
}

/**
 * Reconstitue le panier d'un brouillon.
 *
 * Les prix et les noms viennent du **catalogue d'aujourd'hui**, pas du brouillon :
 * une saisie mise de côté la semaine dernière ne doit pas rouvrir sur un tarif
 * périmé qu'on annoncerait au téléphone. Un SKU disparu est **retiré** et signalé
 * — le garder sans prix donnerait un panier qu'on ne peut pas valider sans
 * comprendre pourquoi.
 */
export function restoreLines(
  view: OrderDraftView,
  catalogue: readonly CatalogItemView[],
): RestoredLines {
  const byId = new Map(catalogue.map((item) => [item.sku, item]));
  const lines: CartLine[] = [];
  const dropped: string[] = [];
  for (const line of view.lines) {
    const item = byId.get(line.sku);
    if (item === undefined) {
      dropped.push(line.sku);
      continue;
    }
    lines.push({
      sku: item.sku,
      name: item.name,
      unitPriceMillicents: item.unitPriceMillicents,
      quantity: line.quantity,
      ...saleTermsOf(item),
    });
  }
  return { lines, dropped };
}

/**
 * L'unité, le pas et le minimum d'un article au poids, lus au catalogue du
 * jour (P5) ; pour une pièce, son seul minimum de pièces quand il en a un
 * (plan quantité minimale, Q6) — sinon rien, la ligne reste celle d'avant.
 */
export function saleTermsOf(
  item: CatalogItemView,
): Pick<CartLine, 'saleUnit' | 'step' | 'minimum'> {
  const step = saleStepOf(item);
  const minimum = firstSaleQuantityOf(item);
  if (item.saleUnit !== 'weight') {
    const pieces = pieceMinimumOf(item);
    return pieces === null ? {} : { minimum: pieces };
  }
  return {
    saleUnit: 'weight',
    ...(step === null ? {} : { step }),
    ...(minimum === null ? {} : { minimum }),
  };
}

/** Le choix par défaut de l'interlocuteur : celui retenu, sinon le détenteur, sinon le premier. */
export function buyerOf(chosen: string | null, members: readonly OrderEntryBuyer[]): string | null {
  if (chosen !== null) {
    return chosen;
  }
  return (members.find((member) => member.role === 'owner') ?? members[0])?.userId ?? null;
}

/** Ce que la saisie a décidé, hors articles — l'entrée de {@link composedDraftOf}. */
export interface DraftDecisions {
  readonly buyerUserId: string | null;
  readonly fulfillment: FulfillmentChoice | null;
  readonly requestedDate: string;
  readonly note: string;
  readonly settlement: StaffSettlement;
  readonly immediate: boolean;
  readonly empty: boolean;
}

/**
 * **La saisie est-elle assez complète pour qu'une commande se compose ?**
 * (plan `plan-prix-de-la-saisie.md`, lot P2) — au moins une ligne, un
 * interlocuteur, un acheminement résolu (point ou adresse, et la tranche du
 * retrait), un jour, un règlement. Le brouillon qu'on passerait, ou `null`.
 *
 * Une seule définition pour la validation et pour l'estimation : estimer une
 * saisie que la validation refuserait de partir, ou l'inverse, montrerait un
 * total qu'aucun clic ne produit.
 */
export function composedDraftOf(decisions: DraftDecisions): OrderDraft | null {
  const { buyerUserId, fulfillment } = decisions;
  if (
    decisions.empty ||
    buyerUserId === null ||
    decisions.requestedDate === '' ||
    fulfillment === null ||
    fulfillment.issue !== null
  ) {
    return null;
  }
  return {
    buyerUserId,
    fulfillmentMethod: fulfillment.method,
    pickupAddressId: fulfillment.pickupAddressId,
    deliveryAddress: fulfillment.deliveryAddress,
    saveAddressToBook: fulfillment.saveToBook,
    requestedDeliveryDate: decisions.requestedDate,
    requestedWindow: fulfillment.window,
    note: decisions.note,
    settlement: decisions.settlement,
    immediate: decisions.immediate,
  };
}

/**
 * **Le corps de la passation — et de l'estimation**, une seule fabrique pour
 * les deux (lot P2) : une estimation d'un corps que la passation n'enverrait
 * pas annoncerait un prix qu'aucune commande ne porte.
 */
export function placePayloadOf(
  companyId: string,
  draft: OrderDraft,
  lines: readonly OrderLineInput[],
  origin: OrderEntryOrigin,
): AdminPlaceOrderPayload {
  return {
    companyId,
    buyerUserId: draft.buyerUserId,
    settlement: draft.settlement,
    fulfillmentMethod: draft.fulfillmentMethod,
    deliveryAddress: draft.deliveryAddress,
    pickupAddressId: draft.pickupAddressId,
    // L'adresse du carnet, quand elle en vient : c'est elle qui porte les
    // consignes dont la commande se prérempli. Une adresse dictée n'en a
    // aucune. Le sélecteur d'acheminement ne remonte pas encore l'id — il le
    // fera avec l'écran d'override.
    deliveryAddressId: null,
    requestedDeliveryDate: draft.requestedDeliveryDate,
    // 🔴 **La clé est OMISE quand aucune tranche n'est convenue**, jamais
    // mise à `null` : le serveur lit l'absence comme « prends le défaut »
    // (celui du carnet, en livraison) et un `null` explicite comme « le
    // client n'en veut aucune ». Un `null` posé par commodité effacerait
    // donc la fenêtre qu'un compte a déclarée sur son adresse. Même parti
    // que le panier du client, et pour la même raison.
    ...(draft.requestedWindow === null ? {} : { requestedWindow: draft.requestedWindow }),
    note: draft.note,
    lines: [...lines],
    // Le « Retrait immédiat » (lot L6) : pris sur la vitrine, et tracé.
    ...(draft.immediate
      ? { supply: 'shelf' as const, entryShortcut: 'immediate_pickup' as const }
      : {}),
    // E4 (Hugo, 2026-11-03) : au comptoir, pas de lien de règlement — le
    // serveur le refuse sur ce signal, l'écran ne le propose pas.
    ...(origin === 'counter' ? { entryOrigin: 'counter' as const } : {}),
  };
}
