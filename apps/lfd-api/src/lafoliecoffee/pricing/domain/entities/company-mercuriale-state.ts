import type { GeneralDiscount } from "./general-discount.js";
import type { MercurialeAmendment } from "./mercuriale-amendment.js";
import type { PromotionAdmission } from "./mercuriale-promotion-policy.js";
import type { PricingGridLine } from "../pricing-grid.js";
import type { RuleLifecycle } from "../rule-lifecycle.js";

/*
 * Les FORMES de la mercuriale — ce qu'on apporte pour poser, et l'état que
 * l'agrégat garde. Séparées de `company-mercuriale.ts`, qui ne porte que ses
 * gestes.
 */

/** Une ligne accordée : un article, ses paliers. Pas de `plannedVolume` — cf. la classe. */
export type MercurialeLine = PricingGridLine;

/** Ce qu'un appelant apporte pour poser : l'intention, pas l'état. */
export interface CompanyMercurialeDraft {
  /** Identifiant **opaque** de la société. Aucune clé étrangère ne traverse. */
  readonly companyId: string;
  readonly label: string;
  readonly lines: readonly MercurialeLine[];
  /** Borne basse **incluse**. */
  readonly validFrom: Date;
  /** Borne haute **exclue**. `null` = sans terme. */
  readonly validTo: Date | null;
  /**
   * La politique de promotions de départ (`plan-la-mercuriale-decide.md`,
   * § 8) — absente = « Aucune promotion », le défaut d'une mercuriale neuve.
   */
  readonly promotionPolicy?: PromotionAdmission | undefined;
  /**
   * **La remise générale** (`plan-remise-generale.md`) — « tout le reste à
   * −30 %, sauf… ». Absente ou `null` : aucune. Une mercuriale qui la porte
   * peut n'avoir aucun prix ferme (D5).
   */
  readonly generalDiscount?: GeneralDiscount | null | undefined;
}

export interface CompanyMercurialeState extends Omit<
  CompanyMercurialeDraft,
  "promotionPolicy" | "generalDiscount"
> {
  /** La remise générale du document ; un avenant peut la changer sur sa fenêtre. */
  readonly generalDiscount: GeneralDiscount | null;
  /**
   * La politique de départ ; un avenant peut en porter une nouvelle à sa date
   * d'effet (cf. {@link CompanyMercuriale.promotionPolicyAt}).
   */
  readonly promotionPolicy: PromotionAdmission;
  readonly id: string;
  readonly createdBy: string;
  readonly lifecycle: RuleLifecycle;
  /**
   * Les avenants datés, **dans l'ordre d'écriture** — chargés dans l'agrégat,
   * parce que c'est lui qui refuse un doublon entre la grille et un avenant.
   */
  readonly amendments: readonly MercurialeAmendment[];
}
