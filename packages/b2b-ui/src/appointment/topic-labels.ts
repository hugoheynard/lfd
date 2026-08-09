import type { AttachableKind, RequestTopic } from "@lfd/contracts";

/**
 * Les **libellés des sujets de demande** — le second niveau de la
 * classification, dont le vocabulaire vit dans `@lfd/contracts`
 * (`request-topic`) et l'écriture ici, comme pour les familles.
 *
 * Un seul libellé par sujet cette fois : à ce niveau de précision, « Changer la
 * fréquence » se lit aussi bien dans un formulaire que dans une file. C'est le
 * niveau au-dessus (la famille) qui avait besoin de deux voix.
 */
const TOPICS: Readonly<Record<RequestTopic, string>> = {
  "discover.offer": "Découvrir l'offre et les produits",
  "discover.pricing": "Connaître les tarifs et la mercuriale",
  "discover.delivery": "Livraison : zones, jours, retrait",

  "quote.new": "Demander un devis",
  "quote.followup": "Relancer un devis en cours",

  "order.status": "Suivre une commande",
  "order.change": "Modifier une commande",
  "order.issue": "Signaler un problème à la réception",
  "order.cancel": "Annuler une commande",

  "recurring.create": "Mettre en place un panier récurrent",
  "recurring.frequency": "Changer la fréquence",
  "recurring.content": "Modifier le contenu",
  "recurring.occurrence": "Modifier ou sauter une échéance",
  "recurring.pause": "Suspendre temporairement",
  "recurring.cancel": "Supprimer le panier récurrent",

  "billing.invoice": "Obtenir une facture",
  "billing.payment": "Problème de paiement",
  "billing.terms": "Conditions de règlement",

  "account.activation": "Activer mon compte (pièces, validation)",
  "account.users": "Gérer les utilisateurs de mon entreprise",
  "account.addresses": "Adresses de livraison et de facturation",

  "other.request": "Autre demande",
};

/** Le libellé d'un sujet, tel qu'il se lit des deux côtés. */
export function topicLabel(topic: RequestTopic): string {
  return TOPICS[topic];
}

/**
 * Comment on **demande** l'objet concerné, quand le sujet en attend un. Le
 * pluriel est volontaire : c'est l'intitulé d'un choix, pas d'une valeur.
 */
const ATTACHABLES: Readonly<Record<AttachableKind, string>> = {
  order: "Commande concernée",
  subscription: "Panier récurrent concerné",
  subscription_occurrence: "Échéance concernée",
};

/** L'intitulé du champ « objet concerné » pour un type d'attachement. */
export function attachableLabel(kind: AttachableKind): string {
  return ATTACHABLES[kind];
}
