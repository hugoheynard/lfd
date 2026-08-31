import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Le **verrou `official`, côté application** — une entrée du droit ne se
 * touche pas.
 *
 * Le trigger `allergen_entry_official_lock` tient déjà la base, et c'est lui la
 * garantie. Cette erreur-ci existe pour ce que le trigger ne peut pas faire :
 * répondre au staff. Sans elle, le refus remonte en `restrict_violation`
 * Postgres — un message qui nomme un mécanisme au lieu de nommer la règle, et
 * qui ne dit pas quoi faire à la place.
 *
 * Elle couvre AUSSI l'archivage, et le trigger aussi : `archived_at` est dans
 * les colonnes qu'il compare, parce qu'archiver EST la suppression de la
 * maison. Les deux disent la même chose au même moment — l'agrégat avec des
 * mots, la base sans appel.
 */
export class OfficialAllergenEntryLockedError extends BusinessError {
  constructor(code: string) {
    super(
      "catalogue.allergen_entry.official_locked",
      `« ${code} » est une entrée officielle du référentiel (code GS1, annexe II ` +
        `du règlement 1169/2011) : elle ne se modifie pas, ne s'archive pas et ne ` +
        `se supprime pas. Pour un besoin maison, créez une entrée à vous — ` +
        `celle-là se règle librement.`,
    );
  }
}

/**
 * Le même verrou, pour les catégories — à une exception près, et elle est
 * volontaire : **l'ordre d'affichage reste libre**.
 *
 * Le trigger jumeau laisse `position` de côté pour cette raison exacte : ranger
 * son écran n'a aucune portée réglementaire, et une catégorie qu'on ne peut pas
 * déplacer transformerait le droit en contrainte d'ergonomie. Tout le reste est
 * gelé, `archived_at` compris : archiver une catégorie de l'annexe II, ce
 * serait retirer une mention d'étiquette sans le dire.
 */
export class OfficialAllergenCategoryLockedError extends BusinessError {
  constructor(key: string) {
    super(
      "catalogue.allergen_category.official_locked",
      `« ${key} » est une catégorie officielle du référentiel (annexe II du ` +
        `règlement 1169/2011) : son libellé est une mention d'étiquette, elle ne ` +
        `se renomme pas et ne s'archive pas. Créez une catégorie maison pour ` +
        `organiser le catalogue — seul l'ordre d'affichage reste réglable ici.`,
    );
  }
}

/**
 * Le code d'une entrée est une **identité de stockage**, pas un libellé : il
 * part tel quel en GDSN et se retrouve dans les déclarations déjà écrites.
 */
export class AllergenCodeInvalidError extends DomainError {
  constructor(raw: string) {
    super(
      "catalogue.allergen.code_invalid",
      `Code allergène invalide : « ${raw} ». Majuscules, chiffres, tirets ou ` +
        `soulignés — c'est un code de stockage, pas un libellé.`,
    );
  }
}

/** La clé d'une catégorie est citée par le code et par les écrans : elle a une forme. */
export class AllergenCategoryKeyInvalidError extends DomainError {
  constructor(raw: string) {
    super(
      "catalogue.allergen_category.key_invalid",
      `Clé de catégorie d'allergène invalide : « ${raw} ». Minuscules, chiffres, ` +
        `tirets ou soulignés — c'est une identité, pas un libellé.`,
    );
  }
}

/** Un allergène sans libellé lisible produirait une étiquette muette. */
export class AllergenLabelRequiredError extends DomainError {
  constructor(what: string) {
    super("catalogue.allergen.label_required", `Le libellé de ${what} est obligatoire.`);
  }
}

/**
 * `inco_category` porte une valeur de l'union fermée des 14 (D1), ou rien.
 *
 * Le refus est ici et pas dans l'adaptateur : c'est le domaine qui sait ce
 * qu'est une catégorie de l'annexe II, et une valeur inconnue relue en base
 * doit se signaler à la relecture plutôt que ressortir vers une projection
 * d'étiquette.
 */
export class UnknownIncoCategoryError extends DomainError {
  constructor(raw: string) {
    super(
      "catalogue.allergen_category.unknown_inco",
      `Catégorie INCO inconnue : « ${raw} ». L'annexe II en compte 14, et elle ne ` +
        `s'étend pas depuis le back-office.`,
    );
  }
}

/** Un rang d'affichage est un entier positif — c'est un ordre, pas une mesure. */
export class AllergenPositionInvalidError extends DomainError {
  constructor(received: number) {
    super(
      "catalogue.allergen_category.position_invalid",
      `Rang d'affichage impossible (${String(received)}) : attendu un entier ≥ 0.`,
    );
  }
}

/**
 * Les refus que **le handler** oppose — l'agrégat ne peut pas les voir.
 *
 * Ils vivent malgré tout dans le domaine, avec les autres : ce sont des règles
 * du référentiel, pas des accidents de transport, et une erreur métier rangée
 * dans `application/` finirait par être levée depuis un contrôleur.
 */

/** La catégorie visée n'existe pas — un identifiant périmé, ou une autre base. */
export class AllergenCategoryNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "catalogue.allergen_category.not_found",
      `Catégorie d'allergène introuvable : « ${id} ». Rechargez l'écran du ` +
        `référentiel — elle a pu être créée sur un autre poste, ou n'a jamais existé.`,
    );
  }
}

/** L'entrée visée n'existe pas. */
export class AllergenEntryNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "catalogue.allergen_entry.not_found",
      `Allergène introuvable : « ${id} ». Rechargez l'écran du référentiel.`,
    );
  }
}

/**
 * Deux catégories ne peuvent pas porter la même clé.
 *
 * La clé est ce qu'un écran, un export et une migration future citent : deux
 * « fruits-coque-exotiques » côte à côte, et plus personne ne sait laquelle une
 * entrée rejoint.
 */
export class AllergenCategoryKeyTakenError extends BusinessError {
  constructor(key: string) {
    super(
      "catalogue.allergen_category.key_taken",
      `Une catégorie d'allergène porte déjà la clé « ${key} ». Choisissez-en une ` +
        `autre, ou modifiez la catégorie existante.`,
    );
  }
}

/**
 * Deux entrées ne peuvent pas porter le même code.
 *
 * Le code part tel quel en GDSN et se retrouve en clair dans les déclarations
 * déjà écrites : un doublon rendrait ambigu ce qu'une étiquette déclare.
 */
export class AllergenCodeTakenError extends BusinessError {
  constructor(code: string) {
    super(
      "catalogue.allergen.code_taken",
      `Le code « ${code} » est déjà porté par un allergène du référentiel. Les ` +
        `codes sont des identités de stockage : choisissez-en un autre.`,
    );
  }
}

/**
 * Archivage refusé : des allergènes encore proposés vivent sous cette
 * catégorie.
 *
 * La clé étrangère `Restrict` ne protège que de l'EFFACEMENT. Archiver la
 * catégorie sans elle laisserait ses entrées offertes à la saisie sous une
 * famille que l'écran ne montre plus — et le formulaire produit, qui groupe par
 * catégorie, n'aurait plus de quoi les ranger.
 */
export class AllergenCategoryStillCitedError extends BusinessError {
  constructor(key: string, cited: number) {
    super(
      "catalogue.allergen_category.still_cited",
      `« ${key} » accueille encore ${String(cited)} allergène(s) proposé(s) à la ` +
        `saisie : archivez-les d'abord, ou déplacez-les vers une autre catégorie.`,
    );
  }
}

/**
 * On ne pose pas une entrée sous une catégorie archivée.
 *
 * Elle serait proposée à la saisie sous une famille retirée du référentiel :
 * l'écran ne pourrait ni la montrer ni la ranger, et personne n'aurait décidé
 * de rouvrir la catégorie.
 */
export class ArchivedAllergenCategoryError extends BusinessError {
  constructor(key: string) {
    super(
      "catalogue.allergen_category.archived",
      `La catégorie « ${key} » est archivée : restaurez-la avant d'y ranger un ` + `allergène.`,
    );
  }
}
