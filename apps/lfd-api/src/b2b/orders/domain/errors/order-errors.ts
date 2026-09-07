import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * L'entreprise visée n'est pas accessible au demandeur — **404** non-divulguant,
 * comme partout ailleurs : on ne révèle pas son existence à qui n'en est pas membre.
 */
export class OrderCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super("orders.company.not_found", "Entreprise introuvable.");
  }
}

/**
 * La commande visée n'existe pas — **ou** le demandeur n'a pas à la voir. Un seul
 * et même 404 dans les deux cas : distinguer « inexistante » de « pas à vous »
 * confirmerait à un curieux qu'un numéro de commande est bien attribué.
 */
export class OrderNotFoundError extends ResourceNotFoundError {
  constructor(readonly orderId: string) {
    super("orders.not_found", "Commande introuvable.");
  }
}

/** Une commande sans ligne n'a pas de sens (le schéma l'interdit déjà ; défense). */
export class EmptyOrderError extends DomainError {
  constructor() {
    super("orders.empty", "Impossible de passer une commande vide.");
  }
}

/** Un SKU envoyé par le client n'existe pas au catalogue. */
export class UnknownSkuError extends DomainError {
  constructor(readonly sku: string) {
    super("orders.sku.unknown", `Article inconnu au catalogue : ${sku}.`);
  }
}

/**
 * Un **retrait** est demandé mais aucun point de retrait n'est configuré (l'adresse
 * labo dans les Réglages). Refus **métier** (409) : la demande est bien formée,
 * mais l'état de la plateforme ne permet pas ce mode d'acheminement.
 */
/**
 * La tranche demandée tombe hors des heures du point. **Business** et non
 * technique : rien n'est cassé, c'est le client qui demande une heure où la
 * porte est close — et il doit pouvoir en choisir une autre.
 */
export class PickupClosedAtRequestedTimeError extends BusinessError {
  constructor() {
    super(
      "orders.pickup.closed_at_requested_time",
      "Le point de retrait est fermé sur la tranche horaire demandée.",
    );
  }
}

export class PickupNotConfiguredError extends BusinessError {
  constructor() {
    super(
      "orders.pickup.not_configured",
      "Le retrait n'est pas disponible : aucun point de retrait n'est configuré.",
    );
  }
}

/** La zone de livraison choisie (coursier) n'existe pas / plus au catalogue. */
export class UnknownDeliveryZoneError extends DomainError {
  constructor(readonly zoneId: string) {
    super("orders.delivery_zone.unknown", `Zone de livraison inconnue : ${zoneId}.`);
  }
}

/**
 * Aucune zone ne couvre le code postal de l'adresse livrée. Refus **métier**
 * (409) : la demande est bien formée, c'est le maillage des zones qui ne dessert
 * pas ce secteur.
 *
 * On refuse plutôt que de livrer à frais nul : un secteur non couvert n'est pas
 * un secteur gratuit, c'est un secteur où la tournée n'a pas de coût connu.
 */
export class NoDeliveryZoneForPostalCodeError extends BusinessError {
  constructor(readonly codePostal: string) {
    super(
      "orders.delivery_zone.not_served",
      `Aucune zone de livraison ne dessert le code postal ${codePostal}. Choisissez le retrait, ou contactez-nous.`,
    );
  }
}

/** Une ligne de commande mal formée (quantité ≤ 0, prix négatif). */
export class InvalidOrderLineError extends DomainError {
  constructor(
    readonly sku: string,
    readonly reason: string,
  ) {
    super("orders.line.invalid", `Ligne « ${sku} » : ${reason}.`);
  }
}

/** L'acheminement est incohérent (coursier sans zone/adresse, retrait sans point). */
export class InvalidOrderFulfillmentError extends DomainError {
  constructor(readonly reason: string) {
    super("orders.fulfillment.invalid", reason);
  }
}

/** Le règlement est incohérent avec le total (carte demandée sur un total nul). */
export class InvalidOrderPaymentError extends DomainError {
  constructor(readonly reason: string) {
    super("orders.payment.invalid", reason);
  }
}

/**
 * On demande à régler une commande qui n'attend aucun règlement — déjà payée,
 * portée au compte, ou annulée. Refus **métier** (409) : la demande est bien
 * formée, c'est l'état de la commande qui s'y oppose.
 *
 * Le message nomme l'état, parce qu'un client qui suit un lien périmé doit
 * comprendre que sa commande va bien, et non qu'elle est cassée.
 */
export class OrderNotPayableError extends BusinessError {
  constructor(readonly paymentStatus: string) {
    super(
      "orders.payment.not_payable",
      paymentStatus === "paid"
        ? "Cette commande est déjà réglée."
        : "Cette commande n'attend aucun règlement en ligne.",
    );
  }
}

/**
 * L'équipe a demandé de porter la commande **au compte** d'une société qui ne
 * règle pas au compte. Refus **métier** (409) : la demande est bien formée,
 * c'est le crédit qui n'existe pas.
 *
 * Ce refus est le mur de cette surface. Sans lui, un écran de back-office
 * suffirait à accorder un délai de paiement qu'aucun commercial n'a négocié — et
 * la plateforme livrerait à crédit sans jamais l'avoir décidé.
 */
export class AccountSettlementNotGrantedError extends BusinessError {
  constructor() {
    super(
      "orders.settlement.account_not_granted",
      "Cette société ne règle pas au compte : la commande doit être réglée par lien de paiement.",
    );
  }
}

/**
 * Le jeton de remise scanné ne correspond à aucune commande — **404** comme
 * partout : un jeton inconnu et un jeton qui n'a jamais existé doivent être
 * indiscernables, sans quoi essayer des chaînes au hasard finirait par dire
 * lesquelles sont attribuées.
 */
export class HandoverTokenNotFoundError extends ResourceNotFoundError {
  constructor() {
    super("orders.handover.not_found", "Ce code de retrait ne correspond à aucune commande.");
  }
}

/**
 * La commande existe mais son état interdit la remise (annulée, déjà remise, en
 * livraison). Refus **métier** (409) : la demande est bien formée, c'est l'état
 * du monde qui s'y oppose. Le message vient de `handoverBlocker` — il sera lu
 * tel quel par la personne au comptoir, d'où le refus d'un code générique.
 */
export class HandoverRefusedError extends BusinessError {
  constructor(readonly reason: string) {
    super("orders.handover.refused", reason);
  }
}

/**
 * Le **numéro de commande** scanné au fournil ne correspond à rien — **404**.
 *
 * Contrairement au jeton de remise, il n'y a ici aucun secret à protéger : un
 * numéro de commande est imprimé sur le papier, il se devine et ça n'ouvre rien.
 * Le 404 est donc une simple absence, pas une précaution — mais le message, lui,
 * doit nommer la cause probable : au fournil, un scan qui ne trouve rien est
 * presque toujours une feuille d'une autre journée.
 */
export class OrderReferenceNotFoundError extends ResourceNotFoundError {
  constructor(readonly reference: string) {
    super(
      "orders.packing.not_found",
      `Aucune commande ${reference} — cette feuille est peut-être d'un autre jour.`,
    );
  }
}

/**
 * La commande existe mais son état interdit le colisage (annulée, déjà remise,
 * déjà prête). Refus **métier** (409) : la demande est bien formée, c'est l'état
 * du monde qui s'y oppose.
 *
 * Le message vient de `packingBlocker` — il sera lu tel quel entre deux
 * fournées, d'où le refus d'un code générique.
 */
export class PackingRefusedError extends BusinessError {
  constructor(readonly reason: string) {
    super("orders.packing.refused", reason);
  }
}

/**
 * **L'heure limite est passée, et la grâce aussi.** Refus métier (409) : le
 * panier est valide, c'est le calendrier qui s'y oppose, et le client peut
 * choisir une autre date.
 *
 * Le message nomme le geste de sortie plutôt que la règle. Quelqu'un à qui l'on
 * dit « limite dépassée » ne sait pas quoi faire ; quelqu'un à qui l'on dit
 * « choisissez une autre date » sait quoi faire. **Il ne renvoie PAS vers le
 * téléphone** : après la grâce, personne ne peut ouvrir — promettre un recours
 * qui n'existe pas coûte un appel pour rien, et la confiance qui va avec.
 *
 * La date demandée est portée par l'erreur — pas interpolée dans le message :
 * un écran la reformate à sa façon, un e-mail à la sienne.
 */
export class PastOrderCutoffError extends BusinessError {
  constructor(readonly fulfillmentDate: string) {
    super(
      "orders.cutoff.past",
      "Il est trop tard pour être servi à cette date. Choisissez une autre date.",
    );
  }
}

/**
 * **La limite est passée mais la grâce court encore.** Refus métier (409), et
 * un refus **différent** du précédent : la commande n'est pas perdue, elle
 * demande qu'un humain la reprenne.
 *
 * Deux erreurs plutôt qu'un drapeau sur une seule, parce que ce qui les
 * distingue n'est pas un détail d'affichage mais **ce que le lecteur doit
 * faire** : changer de date, ou décrocher. Un code unique aurait fait dire la
 * même phrase aux deux, et le rattrapage n'aurait servi à personne.
 *
 * ⚠️ Ce refus reste un refus **tant que la dérogation n'existe pas**. Quand elle
 * arrivera, cette même fenêtre deviendra un passage — pour qui l'accorde.
 *
 * `graceEndsAt` est porté brut : c'est l'écran qui décide de dire « jusqu'à
 * 18 h 45 » ou « encore 12 minutes », pas le domaine.
 */
export class OrderCutoffGraceError extends BusinessError {
  constructor(
    readonly fulfillmentDate: string,
    readonly graceEndsAt: Date,
  ) {
    super(
      "orders.cutoff.grace",
      "L'heure limite est passée pour cette date, mais c'est encore rattrapable : appelez-nous.",
    );
  }
}

/**
 * **Une commande identique est en train de passer.**
 *
 * Levée quand la clé d'idempotence est réclamée, non résolue, et son bail encore
 * valide : un autre appel porte exactement le même panier, en ce moment. Ce
 * n'est pas une panne, et le front ne doit pas l'afficher comme telle — le
 * client dont la commande est en train de partir n'a pas à lire « la commande
 * n'a pas pu être passée ».
 */
export class OrderAlreadyInFlightError extends BusinessError {
  constructor() {
    super(
      "orders.idempotency.in_flight",
      "Cette commande est déjà en train d'être passée. Regardez « Mes commandes » dans un instant.",
    );
  }
}

/**
 * **La clé a déjà servi, pour autre chose.**
 *
 * Une clé d'idempotence désigne UNE tentative. La rejouer avec un panier
 * différent n'est pas une répétition : c'est une nouvelle commande sous une
 * vieille étiquette. L'honorer rendrait l'ancienne commande, et le front
 * viderait le panier corrigé — la correction perdue en silence, l'écran
 * affichant les lignes de l'un sur la commande de l'autre.
 */
export class IdempotencyKeyReusedError extends BusinessError {
  constructor() {
    super(
      "orders.idempotency.reused",
      "Cette clé de passation a déjà servi pour une autre commande.",
    );
  }
}
