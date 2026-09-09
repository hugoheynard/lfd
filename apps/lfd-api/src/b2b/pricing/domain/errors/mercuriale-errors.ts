/**
 * **Les refus d'une MERCURIALE.**
 *
 * Le tarif négocié d'un client. Le mot reste en français : ce n'est ni un
 * `priceList`, ni un `catalog`, ni un `quote` (cf. `CLAUDE.md` §8).
 */

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Une **mercuriale** exprimée autrement qu'en euros.
 *
 * Le piège central du modèle, et la raison pour laquelle `replace` et `alter`
 * sont deux natures distinctes. Un tarif négocié saisi en « −13 % » suit le prix
 * de liste : le jour où le PIM augmente, le prix du client augmente avec lui.
 * Ce n'est pas ce qu'on lui a promis — un engagement se stocke en euros.
 *
 * Les autres étages n'ont pas cette contrainte : « 100+ à 1,80 € fixe » et « cet
 * article offert » sont des gestes réels, et rien ne se casse à les autoriser.
 */
export class MercurialeMustPoseAPriceError extends DomainError {
  constructor() {
    super(
      "pricing.mercuriale.must_pose_a_price",
      "Une mercuriale pose un PRIX en euros, jamais un pourcentage : saisie en pourcentage, elle suivrait les hausses du tarif de liste, ce qui n'est pas ce qui a été négocié.",
    );
  }
}

/**
 * Une mercuriale qui prétend franchir le scellement **qu'elle pose**.
 *
 * `stacksOverMercuriale` est la porte de sortie d'un scellement ; sur l'étage
 * qui scelle, elle ne désigne rien. Refusée plutôt qu'ignorée : un drapeau
 * accepté puis sans effet finit par être coché en croyant obtenir quelque chose.
 */
export class MercurialeCannotStackOverItselfError extends DomainError {
  constructor() {
    super(
      "pricing.mercuriale.cannot_stack_over_itself",
      "C'est la mercuriale qui scelle la chaîne : elle ne peut pas se déclarer elle-même cumulable par-dessus une mercuriale.",
    );
  }
}

/**
 * **Une mercuriale qui ne vise pas une société nommée.**
 *
 * Un tarif négocié se négocie avec **quelqu'un**. C'est l'audience qui en fait
 * le prix de ce client-là ; l'étage, lui, ne dit que le scellement.
 *
 * Ce que refuse cet invariant n'est pas une bizarrerie théorique, c'est le
 * croisement de deux mécanismes justes. `AUDIENCE_RANK` place `all` au plus
 * large, et `resolvePrice` scelle sur **l'étage**, jamais sur l'audience : une
 * mercuriale d'audience `all` s'appliquerait donc à tout le monde ET rendrait
 * transparentes toutes les promotions sur l'article — pour tout le monde, sans
 * qu'aucun écran ne le signale. Le prix qui change se voit ; la promotion
 * éteinte, non.
 *
 * `segment` est refusé pour la même raison : le scellement ne dépend pas de la
 * largeur de l'audience.
 *
 * La règle existait déjà — écrite dans un commentaire du panneau Angular qui
 * n'offre que `promotion` et `geste`, et câble l'audience à `all`. Elle était
 * donc tenue par le fait que personne n'avait ajouté une entrée à une liste de
 * deux. Elle vit ici depuis le 2026-09-08 : une consigne devient une
 * impossibilité, et le filtre `audience_type = 'company'` des lectures de
 * mercuriales devient exhaustif par construction plutôt que par convention
 * d'interface.
 */
export class MercurialeTargetsOneCompanyError extends DomainError {
  constructor(readonly audienceType: string) {
    super(
      "pricing.mercuriale.targets_one_company",
      `Une mercuriale se pose sur une société nommée, jamais sur « ${audienceType} » : ` +
        "un prix négocié avec tout le monde est un tarif catalogue, et il éteindrait " +
        "au passage toutes les promotions sur cet article.",
    );
  }
}

/**
 * **Une mercuriale couvre déjà cette période chez ce client.**
 *
 * Un **409** : ce n'est pas une saisie mal formée, c'est un état du monde qui
 * s'oppose au geste. Le refus NOMME la mercuriale en cours et sa fenêtre, parce
 * que la sortie demande de la clore d'abord — et qu'on ne clôt pas ce qu'on ne
 * sait pas désigner.
 *
 * Écraser en silence était l'autre option, et c'est la pire : un tarif négocié
 * qu'on remplace sans le dire est un tarif dont personne ne saura, au litige,
 * ce qu'il valait la semaine dernière.
 */
export class RunningMercurialeError extends BusinessError {
  constructor(
    readonly label: string,
    readonly validFrom: Date,
    readonly validTo: Date | null,
  ) {
    super(
      "pricing.mercuriale.running",
      `Une mercuriale « ${label} » couvre déjà cette période (du ` +
        `${validFrom.toISOString().slice(0, 10)} ${
          validTo === null ? "sans terme" : `au ${validTo.toISOString().slice(0, 10)}`
        }). Il faut la clore avant d'en poser une autre.`,
    );
  }
}

/** Aucune mercuriale en cours ne porte ce libellé et cette fenêtre chez ce client. */
export class PosedMercurialeNotFoundError extends ResourceNotFoundError {
  constructor(readonly label: string) {
    super("pricing.mercuriale.not_found", `Aucune mercuriale « ${label} » à clore sur ce compte.`);
  }
}

/**
 * **Ce nom est déjà celui d'une autre mercuriale sur la même fenêtre.**
 *
 * Un **409**, et le seul refus qu'un renommage puisse opposer. Une mercuriale se
 * recolle par **(libellé, fenêtre)** : accepter le doublon ferait fusionner deux
 * listes de prix en une seule à la lecture suivante — deux négociations
 * distinctes, deux auteurs, deux grilles, rendues comme une. Rien ensuite ne
 * permettrait de les redistinguer, puisque ce qui les distinguait était
 * précisément le nom.
 *
 * C'est la contrepartie d'une identité déduite. Le jour où la pose portera son
 * propre identifiant, ce refus n'aura plus de raison d'être.
 */
export class MercurialeNameTakenError extends BusinessError {
  constructor(readonly label: string) {
    super(
      "pricing.mercuriale.name_taken",
      `Une autre mercuriale « ${label} » couvre déjà la même période sur ce compte. ` +
        "Deux mercuriales de même nom et de même fenêtre se confondraient : choisissez un autre nom.",
    );
  }
}

/**
 * **Une mercuriale sans rien à accorder.**
 *
 * Une grille vide se lirait chez le client comme un tarif sans contenu, et
 * personne ne saurait si c'est une saisie ratée ou une décision.
 */
export class EmptyMercurialeError extends DomainError {
  constructor() {
    super(
      "pricing.mercuriale.empty",
      "Une mercuriale accorde au moins un prix sur au moins un article : sans ligne, elle ne dit rien.",
    );
  }
}

/** **Deux fois le même article** — deux prix concurrents pour le même SKU. */
export class DuplicateMercurialeSkuError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "pricing.mercuriale.duplicate_sku",
      `L'article « ${sku} » figure deux fois dans cette mercuriale : le prix appliqué dépendrait de l'ordre de lecture.`,
    );
  }
}

/**
 * **Une grille où commander plus coûte plus cher**, ou deux paliers au même seuil.
 *
 * Chaque palier pris isolément est valide ; l'incohérence n'apparaît qu'une fois
 * la grille réunie en une décision. C'est le refus qui justifie que la
 * mercuriale soit un agrégat plutôt qu'un tas de prix.
 */
export class NonDecreasingMercurialeTiersError extends DomainError {
  constructor(
    readonly sku: string,
    readonly minQuantity: number,
  ) {
    super(
      "pricing.mercuriale.non_decreasing_tiers",
      `Sur « ${sku} », le palier à partir de ${String(minQuantity)} ne descend pas le prix : commander plus coûterait plus cher, ou deux paliers se disputent le même seuil.`,
    );
  }
}

/** **Une mercuriale close ne se retouche plus** — c'est une décision terminée. */
export class ArchivedMercurialeIsSealedError extends BusinessError {
  constructor(readonly id: string) {
    super(
      "pricing.mercuriale.archived_is_sealed",
      "Cette mercuriale est close : ce qu'elle a facturé est figé, et elle ne se modifie plus. Posez-en une nouvelle.",
    );
  }
}

/**
 * **Une mercuriale illisible en base.**
 *
 * Sa grille vit en `jsonb`, donc en `unknown` : ni Postgres ni Prisma ne
 * garantissent sa forme. Une main dans la table, une migration ratée, et la
 * ligne devient un objet que rien ne rattrape — sauf ici.
 *
 * `TechnicalError` (500) et non `DomainError` : le client n'a rien fait de mal,
 * c'est la donnée qui est cassée. Un 400 lui ferait corriger sa saisie pour un
 * problème qui n'est pas le sien.
 */
export class CorruptedMercurialeError extends TechnicalError {
  constructor(
    readonly id: string,
    readonly why: string,
  ) {
    super(
      "pricing.mercuriale.corrupted",
      `La mercuriale ${id} est illisible : ${why}. Le tarif de ce client ne peut pas être calculé.`,
    );
  }
}
