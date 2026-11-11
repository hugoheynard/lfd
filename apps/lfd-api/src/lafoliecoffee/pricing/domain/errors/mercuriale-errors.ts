import { describeDay } from "../pricing-act-summary.js";

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
        `${describeDay(validFrom)} ${
          validTo === null ? "sans terme" : `au ${describeDay(validTo)}`
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
 * **Une mercuriale sans rien à accorder** — ni prix ferme, ni remise générale,
 * ou une ligne de prix sans palier.
 *
 * Un document vide se lirait chez le client comme un tarif sans contenu, et
 * personne ne saurait si c'est une saisie ratée ou une décision.
 */
export class EmptyMercurialeError extends DomainError {
  constructor() {
    super(
      "pricing.mercuriale.empty",
      "Une mercuriale accorde au moins un prix ferme sur un article, ou une remise générale : " +
        "sans l'un ni l'autre (ou avec une ligne sans prix), elle ne dit rien. " +
        "Saisissez un prix ou un pourcentage de remise générale.",
    );
  }
}

/**
 * **Un taux de remise générale hors de ]0 % ; 100 %[** — de base ou d'une
 * ligne —, ou qui n'est pas un nombre entier de points de base. 0 % ne remise rien ; 100 % donnerait la
 * marchandise.
 */
export class InvalidGeneralDiscountError extends DomainError {
  constructor(readonly bp: number) {
    super(
      "pricing.mercuriale.general_discount.invalid",
      `La remise générale doit être comprise entre 0,01 % et 99,99 % (reçu : ${String(bp / 100)} %). ` +
        "Corrigez le pourcentage avant d'enregistrer.",
    );
  }
}

/**
 * **Un taux de base qui ne va pas avec le mode** : « tout sauf… » remise le
 * reste du catalogue à un taux, qu'il faut donc dire ; « rien sauf… » ne
 * remise que ses lignes, et un taux de base n'y aurait aucune lecture.
 */
export class GeneralDiscountBaseRateError extends DomainError {
  constructor(readonly mode: "all_except" | "only") {
    super(
      "pricing.mercuriale.general_discount.base_rate",
      mode === "all_except"
        ? "Une remise générale « tout sauf… » porte un taux de base pour le reste du catalogue : saisissez-le."
        : "Une remise générale « seulement sur… » n'a pas de taux de base : chaque ligne porte le sien. Retirez le taux de base.",
    );
  }
}

/** **Deux lignes sur la même famille ou la même déclinaison** — deux taux concurrents. */
export class DuplicateGeneralDiscountTargetError extends DomainError {
  constructor(readonly targetId: string) {
    super(
      "pricing.mercuriale.general_discount.duplicate_target",
      `« ${targetId} » figure deux fois dans la remise générale : le taux appliqué dépendrait de l'ordre de lecture. Gardez une seule ligne.`,
    );
  }
}

/**
 * **Une remise générale « seulement » dont aucune ligne ne porte de taux** :
 * elle ne couvrirait aucun article, et personne ne saurait si c'est voulu.
 */
export class GeneralDiscountIncludesNothingError extends DomainError {
  constructor() {
    super(
      "pricing.mercuriale.general_discount.includes_nothing",
      "Une remise générale « seulement sur… » doit remiser au moins une famille ou une déclinaison. " +
        "Donnez un taux à une ligne, ou passez en « tout sauf… ».",
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
 * **Une remise générale chez un client qui a un engagement de volume**
 * (`la-remise-generale.md`, Q2, tranchée par Hugo le 2026-11-11).
 *
 * Ce qui gagne l'étage mercuriale scelle le prix : l'engagement ne jouerait
 * plus sur rien de ce que la remise couvre — avec « tout », sur rien du tout.
 * Le client perdrait en silence ce qu'il a négocié ; on refuse plutôt.
 */
export class GeneralDiscountOverVolumeCommitmentError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "pricing.mercuriale.general_discount_over_volume_commitment",
      "Ce client a un engagement de volume en cours sur cette période : une remise générale scellerait ses prix et l'engagement ne jouerait plus sur les articles couverts. Clôturez d'abord l'engagement, ou accordez des prix fermes article par article.",
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
