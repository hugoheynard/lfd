import type {
  AtelierSheet,
  AtelierSheetLine,
  ClientSheet,
  ClientSheetLine,
  OrderLineView,
  OrderView,
  SheetCustomer,
  SheetFulfillment,
  SheetMoney,
  StaffSheet,
  StaffSheetLine,
} from "@lfd/contracts";

/**
 * **La projection d'une commande en bon de commande**, par audience.
 *
 * Pure et sans dépendance : ni horloge, ni aléa, ni port. Deux appels sur la
 * même commande rendent la **même** feuille, au champ près — c'est ce qui rendra
 * un tirage PDF idempotent sans verrou, et ce qui permet de l'éprouver sans
 * monter Nest.
 *
 * ## Pourquoi c'est ICI et pas dans le navigateur
 *
 * C'est une règle de sécurité avant d'être une règle d'écran. Si le SKU, le
 * tarif d'entrée et le nom des étages descendent dans la charge utile du client
 * et ne sont que masqués au rendu, ils sont **dans l'onglet réseau** — et un
 * client qui empile trois commandes reconstitue la grille tarifaire. Ce que le
 * serveur ne projette pas, l'écran ne peut pas fuiter.
 *
 * ## Ce que la feuille ne porte pas
 *
 * **Le jeton de remise.** Il est passé à part au seul gabarit qui l'affiche (le
 * courriel). S'il était ici, un rendu papier pourrait l'imprimer — et le papier
 * d'une livraison voyage dans le carton, où un coursier scannerait son propre
 * colis.
 *
 * Doc : `documentation/order/architecture-bon-de-commande.md`.
 */

/**
 * L'instant du tirage — celui où la **révision est devenue vraie**, pas celui du
 * rendu.
 *
 * Tant qu'aucun avenant n'existe, c'est la passation. Le jour où le mécanisme
 * arrivera, ce sera la date du dernier avenant : la fonction changera ici, et
 * nulle part ailleurs.
 */
function issuedAtOf(order: OrderView): string {
  return order.placedAt;
}

/**
 * Le nombre d'avenants appliqués depuis la passation.
 *
 * `0` sur toutes les commandes actuelles, et c'est **vrai** — aucune n'a
 * d'avenant, le mécanisme n'existe pas. Le champ existe avant lui pour qu'aucun
 * document en circulation ne soit muet le jour où il arrivera.
 */
const REVISION_WITHOUT_AMENDMENTS = 0;

/**
 * L'adresse qui compte : celle de livraison en coursier, le point de retrait
 * sinon. `null` reste possible — une commande peut n'en avoir figé aucune.
 */
function fulfillmentOf(order: OrderView): SheetFulfillment {
  const agreed = order.fulfillment.contact.value;
  return {
    method: order.fulfillmentMethod,
    address: order.fulfillmentMethod === "delivery" ? order.deliveryAddress : order.pickupAddress,
    // Le point NOMMÉ n'est pas dans `OrderView` : seule l'adresse figée y est.
    // La feuille du fournil, elle, l'a — c'est le lecteur de production qui la
    // compose, avec la table des points sous la main.
    pickupLabel: null,
    window: order.fulfillment.window.value,
    // Depuis une `OrderView`, la seule provenance possible est la commande : le
    // repli sur le détenteur du compte demande la société, que la vue ne porte
    // pas. Le lecteur de production, lui, sait le faire.
    contact:
      agreed === null
        ? null
        : {
            source: "order",
            name: `${agreed.prenom} ${agreed.nom}`.trim(),
            phone: agreed.telephone,
          },
    signatureRequired: order.fulfillment.signatureRequired.value,
  };
}

/** Les montants figés, recopiés — jamais recalculés. */
function moneyOf(order: OrderView): SheetMoney {
  return {
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    discountAdjustment: order.discountAdjustment,
    deliveryFeeCents: order.deliveryFeeCents,
    lateFeeCents: order.lateFeeCents,
    vatCents: order.vatCents,
    totalCents: order.totalCents,
    currency: order.currency,
  };
}

/**
 * Les **libellés** des étages qui ont produit un effet, dans l'ordre.
 *
 * Seul le `label` sort : le contrat le déclare destiné au client, ce qui le rend
 * affichable des deux côtés. Le `stage`, le `ruleId` et la portée restent au
 * serveur — ce sont eux, la grille.
 *
 * Une ligne sans trace rend une liste vide, pas une phrase inventée.
 */
function priceLabelsOf(line: OrderLineView): readonly string[] {
  return (line.pricing?.steps ?? []).map((step) => step.label);
}

/**
 * Le tarif d'**entrée**, seulement s'il diffère de ce qui a été facturé.
 *
 * `null` couvre deux cas qu'on ne peut pas distinguer et qui se rendent pareil :
 * aucune règle n'a joué, ou la ligne ne porte aucune trace. Le combler avec le
 * prix facturé affirmerait « aucune altération » sur les seules commandes qu'on
 * ne peut plus vérifier.
 *
 * ⚠️ Jumeau volontaire d'`entryPriceOf` dans `@lfd/b2b-ui` : ce paquet est
 * Angular, le serveur ne peut pas l'importer. Les deux dérivations doivent dire
 * la même chose — si l'une bouge, l'autre aussi.
 */
function entryPriceOf(line: OrderLineView): number | null {
  const base = line.pricing?.basePriceMillicents ?? null;
  return base === null || base === line.unitPriceMillicents ? null : base;
}

function atelierLineOf(line: OrderLineView): AtelierSheetLine {
  return { sku: line.sku, productName: line.productName, quantity: line.quantity };
}

function clientLineOf(line: OrderLineView): ClientSheetLine {
  return {
    productName: line.productName,
    quantity: line.quantity,
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate,
    lineTotalCents: line.lineTotalCents,
    priceLabels: priceLabelsOf(line),
  };
}

function staffLineOf(line: OrderLineView): StaffSheetLine {
  return {
    ...clientLineOf(line),
    sku: line.sku,
    entryPriceMillicents: entryPriceOf(line),
    floored: line.pricing?.floored ?? false,
  };
}

/** Ce que toute feuille porte, quelle que soit son audience. */
function commonOf(order: OrderView) {
  return {
    orderId: order.id,
    reference: order.orderNumber,
    placedAt: order.placedAt,
    requestedFor: order.requestedDeliveryDate,
    fulfillment: fulfillmentOf(order),
    note: order.note,
    origin: order.origin,
    issuedAt: issuedAtOf(order),
    revision: REVISION_WITHOUT_AMENDMENTS,
  };
}

/**
 * La feuille du fournil : ce qu'on fabrique, par quel SKU on le retrouve, et
 * **aucun montant**. Pas masqué — absent : le type n'a pas la propriété.
 *
 * Une feuille oubliée sur un plan de travail ne doit pas raconter les prix
 * négociés à qui la ramasse, et celle d'une livraison voyage dans le carton.
 */
export function atelierSheetOf(order: OrderView, customer: SheetCustomer): AtelierSheet {
  return {
    ...commonOf(order),
    audience: "atelier",
    customer,
    lines: order.lines.map(atelierLineOf),
  };
}

/** La feuille du client : son engagement, dans ses mots. */
export function clientSheetOf(order: OrderView): ClientSheet {
  return {
    ...commonOf(order),
    audience: "client",
    lines: order.lines.map(clientLineOf),
    money: moneyOf(order),
  };
}

/**
 * La même, **augmentée**. C'est toute la promesse d'une pièce unique : quand le
 * client appelle en lisant sa feuille, le commercial lit la sienne et les deux
 * tombent juste — le vocabulaire diffère, jamais les montants.
 */
export function staffSheetOf(order: OrderView, customer: SheetCustomer): StaffSheet {
  return {
    ...commonOf(order),
    audience: "staff",
    customer,
    lines: order.lines.map(staffLineOf),
    money: moneyOf(order),
  };
}

/**
 * ⚠️ **Il n'y a volontairement PAS de `orderSheetOf(order, audience)`.**
 *
 * Un tel aiguilleur existait, et il était un passif : c'est exactement l'appel
 * qu'on ajoute « pour factoriser » le jour où une route reçoit une audience en
 * paramètre — et ce jour-là, le demandeur choisit ce qu'il lit. Trois fonctions
 * nommées, chacune avec les entrées que son audience exige, ne se détournent
 * pas de la même façon : la feuille du client ne prend pas de `customer` parce
 * qu'elle n'en a pas, et celles du fournil et du bureau ne peuvent pas s'en
 * passer.
 */
