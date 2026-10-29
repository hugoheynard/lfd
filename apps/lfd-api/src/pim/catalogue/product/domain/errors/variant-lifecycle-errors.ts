import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Les refus des gestes qui changent la place d'une déclinaison dans sa fiche —
 * l'archiver, en faire un produit, la désarchiver, ou en faire la déclinaison
 * par défaut (`plan-gestes-de-declinaison.md`, D1, D2, G3 et G4).
 *
 * Des `BusinessError` (409) : la demande est bien formée, c'est l'état de la
 * fiche qui la refuse, et chaque message dit le geste qui la rend possible.
 */

/** La déclinaison par défaut porte la fiche : on en désigne une autre d'abord. */
export class DefaultVariantNotDiscontinuableError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.default_not_discontinuable",
      `La déclinaison « ${variantSku} » est celle par défaut de sa fiche : elle ne s'archive pas ` +
        "tant que d'autres déclinaisons sont en vente. Archivez la fiche entière, ou attendez le " +
        "retour du changement de déclinaison par défaut (suspendu jusqu'à la bascule de la " +
        "référence du défaut).",
    );
  }
}

/** La dernière déclinaison vivante : c'est la fiche qu'on archive. */
export class LastLiveVariantNotDiscontinuableError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.last_live_not_discontinuable",
      `La déclinaison « ${variantSku} » est la dernière encore en vente sur sa fiche : ` +
        "archivez la fiche entière plutôt que sa dernière déclinaison.",
    );
  }
}

/** Déjà archivée : il n'y a rien à archiver, ni à détacher. */
export class VariantAlreadyDiscontinuedError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.already_discontinued",
      `La déclinaison « ${variantSku} » est déjà archivée : elle n'est plus en vente, ` +
        "et on ne peut ni l'archiver de nouveau, ni en faire un produit.",
    );
  }
}

/** Le défaut ne se détache pas : il emporterait la fiche avec lui. */
export class DefaultVariantNotDetachableError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.default_not_detachable",
      `La déclinaison « ${variantSku} » est celle par défaut de sa fiche : on n'en fait pas un ` +
        "produit séparé. Le changement de déclinaison par défaut, qui le permettrait, est " +
        "suspendu jusqu'à la bascule de la référence du défaut.",
    );
  }
}

/** Désarchiver ce qui n'est pas archivé n'a pas de sens. */
export class VariantNotDiscontinuedError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.not_discontinued",
      `La déclinaison « ${variantSku} » n'est pas archivée : elle est déjà en vente avec sa fiche.`,
    );
  }
}

/** Devenue un produit : la remettre en vente vendrait deux fois le même article. */
export class DetachedVariantNotRestorableError extends BusinessError {
  constructor(
    readonly variantSku: string,
    readonly productId: string,
    productLabel: string = productId,
  ) {
    super(
      "catalogue.variant.detached_not_restorable",
      `La déclinaison « ${variantSku} » est devenue le produit « ${productLabel} » : elle vit déjà ` +
        "sous cette fiche, et la désarchiver vendrait deux fois le même article. " +
        "Allez sur la fiche de ce produit pour le modifier.",
    );
  }
}

/** Elle l'est déjà : il n'y a rien à changer. */
export class VariantAlreadyDefaultError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.already_default",
      `La déclinaison « ${variantSku} » est déjà la déclinaison par défaut de sa fiche : ` +
        "il n'y a rien à changer.",
    );
  }
}

/** Une archivée n'est plus en vente : elle ne peut pas porter la fiche. */
export class DiscontinuedVariantNotDefaultableError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.discontinued_not_defaultable",
      `La déclinaison « ${variantSku} » est archivée : elle ne peut pas devenir la déclinaison ` +
        "par défaut d'une fiche qui ne la vend plus. Désarchivez-la d'abord.",
    );
  }
}

/**
 * Elle suit une moitié de la fiche que le défaut actuel n'a jamais saisie, et
 * elle en garde une à elle, en sommeil. Devenue le défaut, elle devrait recevoir
 * « rien » en propre — or sa saisie endormie se réveillerait sur l'étiquette.
 */
export class DormantSheetWouldWakeError extends BusinessError {
  constructor(
    readonly variantSku: string,
    readonly half: "allergens" | "nutrition",
  ) {
    const the = half === "allergens" ? "les allergènes" : "les valeurs nutritionnelles";
    super(
      "catalogue.variant.dormant_sheet_would_wake",
      `La déclinaison « ${variantSku} » suit ${the} de la déclinaison par défaut, qui n'en ` +
        `a rien déclaré, et elle garde en sommeil une ancienne saisie à elle. En faire la ` +
        `déclinaison par défaut réveillerait cette saisie sur l'étiquette. Déclarez d'abord ` +
        `${the} de la déclinaison par défaut actuelle, ou désalignez celle-ci et relisez sa saisie.`,
    );
  }
}

/**
 * **Le changement de déclinaison par défaut est fermé jusqu'à la bascule**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 10, D-b).
 *
 * Tant que le défaut se vend sous la référence de sa fiche, changer de défaut
 * déplace tout ce qui est posé sur cette référence, et un seul changement en
 * production ferait refuser la migration de bascule. Le geste revient avec
 * elle (L3), où il ne déplace plus rien.
 */
export class DefaultVariantChangeSuspendedError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.default_change_suspended",
      "Le changement de déclinaison par défaut revient après la bascule de la référence du " +
        `défaut. La déclinaison « ${variantSku} » garde sa place pour l'instant.`,
    );
  }
}
