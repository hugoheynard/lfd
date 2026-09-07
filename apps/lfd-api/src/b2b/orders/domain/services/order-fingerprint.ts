import { createHash } from "node:crypto";

import type { PlaceOrderPayload } from "@lfd/contracts";

/**
 * **L'empreinte de ce qui a été demandé** — ce qui distingue un rejeu d'une
 * réutilisation de clé sur un panier corrigé.
 *
 * Sans elle, le chemin est le suivant : le client reçoit un refus, corrige son
 * panier, renvoie avec **la même clé** — et reçoit l'ANCIENNE commande. Le front
 * vide alors le panier corrigé et affiche les lignes du nouveau sur la commande
 * de l'ancien. Rien ne lève, rien ne se voit, et la correction est perdue.
 *
 * ## Ce qui entre, et ce qui n'entre pas
 *
 * Tout ce qui change **ce qu'on achète et où ça va** : les lignes, la date,
 * l'acheminement, la société. Rien de ce qui change seulement la façon de le
 * dire — la note libre en fait partie, et c'est un choix : corriger une faute
 * de frappe dans « merci de sonner » ne doit pas transformer un rejeu en refus.
 *
 * Les lignes sont **triées** avant hachage. Deux paniers identiques dont l'écran
 * a réordonné l'affichage sont le même panier ; les traiter comme deux
 * demandes différentes rendrait un refus à un client qui n'a rien changé.
 *
 * ## Pourquoi un hachage et pas le corps
 *
 * On ne compare jamais, on n'affiche jamais, on ne relit jamais : on veut
 * seulement savoir si c'est le même. Garder le corps entier ferait de cette
 * table une seconde copie des commandes — avec ses adresses et ses quantités —
 * pour un besoin qui tient en 64 caractères.
 */
export function orderFingerprint(payload: PlaceOrderPayload): string {
  const lines = [...payload.lines]
    .map((line) => `${line.sku}:${String(line.quantity)}`)
    .sort((a, b) => a.localeCompare(b));
  const material = JSON.stringify({
    companyId: payload.companyId,
    method: payload.fulfillmentMethod,
    pickupAddressId: payload.pickupAddressId,
    deliveryAddressId: payload.deliveryAddressId,
    // L'adresse livrée entre en ENTIER : c'est elle qui décide de la zone, donc
    // du frais. Deux commandes qui ne diffèrent que par la rue sont deux
    // commandes, même si tout le reste est identique.
    deliveryAddress: payload.deliveryAddress,
    requestedDeliveryDate: payload.requestedDeliveryDate,
    lines,
  });
  return createHash("sha256").update(material).digest("hex");
}
