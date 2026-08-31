import type {
  BillingAddressPayload,
  CatalogItemView,
  DeliveryAddressView,
  OrderDraftPayload,
  OrderDraftView,
} from '@lfd/contracts';

import type { CartLine } from './cart.store';
import { NEW_ADDRESS, type DraftSnapshot } from './draft.store';

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
    note: draft.note,
    settlement: draft.settlement,
    // Des SKU et des quantités, **jamais de prix** : c'est le catalogue serveur
    // qui fera foi à la reprise comme à la passation.
    lines: lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
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
    });
  }
  return { lines, dropped };
}
