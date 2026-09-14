import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus propres à la **production**.
 *
 * Deux catégories et pas une : `DomainError` dit « cette donnée ne peut pas
 * exister », `BusinessError` dit « cet état ne permet pas ce geste ». Les
 * confondre rendrait un 400 là où le fournil attend un 409, et un écran qui
 * propose de réessayer là où il faut refuser.
 */

/**
 * La journée est **déjà arrêtée**.
 *
 * ⚠️ Ce n'est pas une garde de confort : le compte à produire est un instantané
 * pris à la clôture, et les commandes bougent après. Le recalculer donnerait un
 * autre nombre que celui sur lequel le fournil a lancé ses fournées.
 */
export class ProductionDayAlreadyClosedError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.day.already_closed",
      `La journée du ${serviceDay} est déjà arrêtée. Son compte à produire ne se recalcule pas.`,
    );
  }
}

/** On n'arrête pas une journée sans commande : il n'y aurait rien à produire. */
export class ProductionDayEmptyError extends BusinessError {
  constructor(serviceDay: string) {
    super("production.day.empty", `Aucune commande à produire le ${serviceDay} : rien à arrêter.`);
  }
}

/**
 * La journée n'est **pas encore arrêtée**, et deux gestes l'exigent.
 *
 * **Le compte à produire** : tiré d'une journée ouverte, il serait arrêté sur un
 * état qui bouge encore — donc faux à la seconde où on le lit, et pire, archivé
 * sous une clé qui le rendrait ensuite tel quel.
 *
 * **Le colisage** : une commande qu'aucune clôture n'a inscrite n'est pas à
 * fabriquer aujourd'hui. La déclarer colisée créerait un fait sur une journée
 * qui n'existe pas encore.
 */
export class ProductionDayNotClosedError extends BusinessError {
  constructor(serviceDay: string) {
    // 🔴 Le message nommait le compte à produire — juste pour le tirage du PDF,
    // hors sujet pour un colisage refusé, qui lève la MÊME erreur. Il nomme
    // désormais le cas et le geste de sortie, ce qui vaut pour les deux : ce
    // refus est lu par quelqu'un qui n'a pas le code sous les yeux.
    super(
      "production.day.not_closed",
      `La journée du ${serviceDay} n'est pas arrêtée. Clôturez le plan du soir d'abord.`,
    );
  }
}

/**
 * Aucune feuille pour cette référence dans cette journée.
 *
 * Un `ResourceNotFoundError` et pas un refus métier : la question « où est la
 * feuille de CMD-0009 du 8 septembre ? » a une réponse vide, ce qui est
 * différent d'un état qui interdit le geste.
 */
export class AtelierSheetNotFoundError extends ResourceNotFoundError {
  constructor(reference: string, serviceDay: string) {
    super(
      "production.sheet.not_found",
      `Aucune feuille d'atelier pour ${reference} le ${serviceDay}.`,
    );
  }
}

/**
 * Le bac est **déjà fait**.
 *
 * Deux mains sur la même feuille est le cas NORMAL au fournil, pas une anomalie :
 * le premier scan est le seul vrai, et le second ne doit ni réécrire l'heure ni
 * changer l'identité qui l'a déclaré.
 */
export class OrderAlreadyPackedError extends BusinessError {
  constructor(reference: string) {
    super("production.order.already_packed", `Le colisage de ${reference} est déjà déclaré.`);
  }
}

/** Un jour de service s'écrit `AAAA-MM-JJ`, et rien d'autre. */
export class InvalidServiceDayError extends DomainError {
  constructor(value: string) {
    super(
      "production.service_day.invalid",
      `Jour de service invalide : « ${value} » (AAAA-MM-JJ attendu).`,
    );
  }
}

/**
 * La plage demandée n'en est pas une.
 *
 * Deux cas, un seul refus : la fin précède le début, ou la plage dépasse ce
 * qu'un écran peut montrer d'un coup. Le second n'est pas une garde de
 * performance — c'est la raison d'être de l'écran : une matrice de quatre-vingts
 * colonnes ne répond plus à « quand est-ce que ça me tombe dessus », elle
 * demande de faire défiler pour le savoir.
 */
export class InvalidServiceRangeError extends DomainError {
  constructor(reason: string) {
    super("production.service_range.invalid", `Plage de production invalide : ${reason}.`);
  }
}

/**
 * Aucun article sous ce SKU dans le **compte à produire** de la journée.
 *
 * ⚠️ Ce n'est pas « ce produit n'existe pas » : la production ne connaît pas le
 * catalogue. C'est « il n'est pas au programme de ce jour-là », et c'est la
 * seule chose qu'elle sache dire. Un 404, donc, et pas un 400 — l'appelant ne
 * corrigera pas sa charge, il regarde la mauvaise journée.
 */
export class ProducedItemNotFoundError extends ResourceNotFoundError {
  constructor(sku: string, serviceDay: string) {
    super(
      "production.item.not_found",
      `Aucun article « ${sku} » au compte à produire du ${serviceDay}.`,
    );
  }
}

/**
 * Aucune ligne sous ce SKU dans le **bac** de cette commande.
 *
 * ⚠️ Ce n'est pas {@link ProducedItemNotFoundError} : un article peut très bien
 * être au compte à produire du jour sans être dans CE bon-là. Le poste de
 * colisage coche une ligne de commande, pas un article du four — d'où deux
 * refus distincts, qui ne se remplacent pas.
 */
export class PackingLineNotFoundError extends ResourceNotFoundError {
  constructor(sku: string, reference: string) {
    super("production.packing.line_not_found", `Aucune ligne « ${sku} » sur le bon ${reference}.`);
  }
}

/**
 * Le bac est **fermé**, et son contenu ne bouge plus.
 *
 * La fermeture est le fait irréversible du colisage : le commerce en tire son
 * « prête pour le client », et le client l'apprend. Laisser décocher une ligne
 * après coup ferait mentir ce qui a déjà été annoncé — c'est pour ça que le
 * refus porte sur les DEUX gestes, cocher comme décocher.
 */
export class PackedOrderSealedError extends BusinessError {
  constructor(reference: string) {
    super(
      "production.packing.order_sealed",
      `Le bac de ${reference} est fermé : son contenu a été annoncé au client et ne se modifie plus. Signalez l'écart au commerce plutôt que de le corriger ici.`,
    );
  }
}

/**
 * Le nombre de containers annoncé n'en est pas un.
 *
 * Un `DomainError` et pas un refus métier : ce n'est pas l'état de la journée
 * qui interdit le geste, c'est la donnée qui ne peut pas exister. On ne charge
 * pas deux bacs et demi dans un véhicule, ni moins que zéro.
 *
 * Le plafond en fait partie depuis le 2026-09-14 : le compte se calcule
 * désormais au serveur, pas par pas, et un plafond tenu par le seul schéma de
 * la route aurait laissé le « + » le franchir. Il vaut
 * `MAX_CONTAINERS_PER_ORDER`, le même nombre que `setPackingContainersSchema`.
 */
export class InvalidContainerCountError extends DomainError {
  constructor(value: number) {
    super(
      "production.packing.invalid_container_count",
      `Nombre de containers invalide : ${String(value)}. Saisissez un nombre entier de bacs, de zéro à 99.`,
    );
  }
}

/**
 * L'article n'est **pas encore sorti du four**, et il ne peut pas entrer dans
 * un bac.
 *
 * Ce n'est pas un droit qui manque, c'est une marchandise qui n'existe pas
 * encore : la balance compterait comme réparti ce qui n'a jamais été fabriqué,
 * et le reste affiché deviendrait faux dans le seul sens qui coûte — optimiste.
 *
 * ⚠️ Le refus ne vaut que dans **un** sens. Ressortir du bac une ligne devenue
 * « en attente » — parce que quelqu'un a repris sa coche sur la fiche d'atelier
 * — reste autorisé : refuser les deux sens enfermerait l'exploitant avec un bac
 * qu'il ne peut ni compléter ni corriger.
 */
export class LineNotProducedYetError extends BusinessError {
  constructor(productName: string) {
    super(
      "production.packing.not_produced_yet",
      `« ${productName} » n'est pas encore sorti du four. Cochez-le sur la fiche d'atelier avant de le mettre au bac.`,
    );
  }
}

/**
 * La commande a atteint le **plafond de containers**.
 *
 * Un refus métier (409) et pas une donnée invalide : le geste « + » est bien
 * formé, c'est l'état de la commande qui ne le permet plus.
 */
export class ContainerCeilingReachedError extends BusinessError {
  constructor(reference: string, ceiling: number) {
    super(
      "production.packing.container_ceiling",
      `La commande ${reference} compte déjà ${String(ceiling)} containers, le maximum. Vérifiez le compte avant d'en ajouter : une commande n'en occupe jamais autant.`,
    );
  }
}

/**
 * Le compte de containers **a bougé pendant l'envoi**.
 *
 * L'écriture est atomique et bornée en base : quand elle ne s'applique pas
 * alors que l'état relu juste après la permettrait, c'est qu'un autre poste a
 * changé la commande entre les deux. Refuser plutôt que réessayer en silence :
 * celui qui appuie doit relire ce que son voisin vient de faire.
 */
export class ContainerStepConflictError extends BusinessError {
  constructor(reference: string) {
    super(
      "production.packing.container_step_conflict",
      `Le nombre de containers de ${reference} vient d'être modifié depuis un autre poste. Relisez le poste, puis recommencez si besoin.`,
    );
  }
}
