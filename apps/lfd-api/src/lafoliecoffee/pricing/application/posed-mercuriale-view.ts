import type {
  PosedMercurialeAmendmentView,
  PosedMercurialeLineView,
  PosedMercurialeStatus,
  PosedMercurialeView,
} from "@lfd/contracts";

import type { MercurialePromotionPolicyView } from "@lfd/contracts";
import type { PromotionAdmission } from "../domain/entities/mercuriale-promotion-policy.js";
import type { StaffAuthors } from "../../../staff/directory/domain/staff-author-directory.js";

import type { CompanyMercuriale, LineSegment } from "../domain/entities/company-mercuriale.js";

/**
 * **La mercuriale d'un client, telle que son dossier la montre.**
 *
 * ## Ce qui a changé le 2026-09-08
 *
 * Ce fichier remplace `posed-mercuriales.ts`, qui **reconstituait** une
 * mercuriale en regroupant les règles partageant `(libellé, fenêtre)` — la
 * seule chose que la pose leur donnait en commun. Cette déduction ne savait pas
 * distinguer deux poses homonymes sur la même fenêtre, ni une règle saisie à la
 * main qui aurait repris par hasard le même libellé.
 *
 * Il n'y a plus rien à déduire : la mercuriale est un objet, et cette fonction
 * n'est qu'une **projection**. C'est tout l'intérêt de l'avoir rendue réelle.
 *
 * Fonction **pure** : elle reçoit son instant et le nom des articles, elle ne
 * lit ni horloge ni base.
 */

/** De quoi nommer un article. Rendu par l'appelant, qui tient le catalogue. */
export type ProductNamer = (sku: string) => string;

/**
 * L'article est-il réservé à un autre compte que celui de la mercuriale ?
 * (`plan-articles-sur-mesure.md`, Q1) — rendu par l'appelant, qui a lu le
 * catalogue au nom du client.
 */
export type ReservedElsewhere = (sku: string) => boolean;

const NOWHERE: ReservedElsewhere = () => false;

/**
 * L'état de la mercuriale **à l'instant lu**.
 *
 * Dérivé, jamais stocké : une colonne `status` pourrait contredire ses propres
 * dates. `suspended` l'emporte sur la fenêtre — une mercuriale qu'on a mise en
 * pause n'agit pas, même si sa fenêtre est ouverte.
 */
function statusOf(mercuriale: CompanyMercuriale, at: Date): PosedMercurialeStatus {
  return windowStatusOf(mercuriale, mercuriale.toPersistence(), at);
}

/**
 * La même logique sur une fenêtre quelconque — celle d'une ligne d'avenant, ou
 * d'une ligne arrêtée. La pause est toujours celle du DOCUMENT (Q3).
 */
function windowStatusOf(
  mercuriale: CompanyMercuriale,
  window: { readonly validFrom: Date; readonly validTo: Date | null },
  at: Date,
): PosedMercurialeStatus {
  const suspendedFrom = mercuriale.suspendedFrom;
  if (suspendedFrom !== null && suspendedFrom.getTime() <= at.getTime()) {
    return "suspended";
  }
  const { validFrom, validTo } = window;
  if (validFrom.getTime() > at.getTime()) {
    return "scheduled";
  }
  // Borne haute EXCLUE, comme partout dans ce contexte : une fenêtre qui se
  // ferme à l'instant lu est déjà terminée.
  if (validTo !== null && validTo.getTime() <= at.getTime()) {
    return "expired";
  }
  return "active";
}

/**
 * Ce qu'elle accorde, **du moins cher au plus cher**.
 *
 * Trié par prix et non par nom : ce qu'on cherche en ouvrant une mercuriale est
 * ce qu'on a le plus lâché, pas la place d'un article dans l'alphabet.
 *
 * Une ligne par **palier** : une grille à trois paliers sur un article en donne
 * trois, et les fondre obligerait à choisir laquelle montrer.
 */
function linesOf(
  mercuriale: CompanyMercuriale,
  at: Date,
  nameOf: ProductNamer,
  reservedElsewhere: ReservedElsewhere,
): readonly PosedMercurialeLineView[] {
  return mercuriale.segments
    .flatMap((segment) =>
      segment.line.tiers.map((tier) => ({
        sku: segment.line.sku,
        productName: nameOf(segment.line.sku),
        unitPriceMillicents: tier.unitPriceMillicents,
        minQuantity: tier.minQuantity,
        ...ownWindowOf(mercuriale, segment, at),
        ...(reservedElsewhere(segment.line.sku)
          ? { lockedReason: "reserved_to_other_account" as const }
          : {}),
      })),
    )
    .sort((left, right) => left.unitPriceMillicents - right.unitPriceMillicents);
}

/**
 * Ce qu'une ligne dit d'elle-même quand elle ne suit pas le document : sa
 * fenêtre, son état, et l'avenant qui l'a ouverte. Rien pour une ligne de la
 * grille qu'aucun avenant n'arrête — la forme d'avant les avenants.
 */
function ownWindowOf(mercuriale: CompanyMercuriale, segment: LineSegment, at: Date) {
  const document = mercuriale.toPersistence();
  const sameWindow =
    segment.from.getTime() === document.validFrom.getTime() &&
    (segment.to?.getTime() ?? null) === (document.validTo?.getTime() ?? null);
  if (segment.amendment === null && sameWindow) {
    return {};
  }
  return {
    validFrom: segment.from.toISOString(),
    validTo: segment.to?.toISOString() ?? null,
    status: windowStatusOf(mercuriale, { validFrom: segment.from, validTo: segment.to }, at),
    ...(segment.amendment === null
      ? {}
      : { amendmentId: segment.amendment.id, amendmentReason: segment.amendment.reason }),
  };
}

/** Ses avenants non rangés, dans l'ordre d'écriture. */
function amendmentsOf(
  mercuriale: CompanyMercuriale,
  authors: StaffAuthors,
): readonly PosedMercurialeAmendmentView[] {
  return mercuriale.amendments
    .filter((amendment) => amendment.archivedAt === null)
    .map((amendment) => ({
      id: amendment.id,
      validFrom: amendment.validFrom.toISOString(),
      validTo: amendment.validTo?.toISOString() ?? null,
      reason: amendment.reason,
      openedSkus: amendment.lines.map((line) => line.sku),
      endedSkus: [...amendment.endedSkus],
      promotionPolicy: policyView(amendment.promotionPolicy ?? null),
      createdBy: amendment.createdBy,
      createdByName: authors.nameOf(amendment.createdBy),
    }));
}

/**
 * @param nameOf retombe sur le SKU nu quand le catalogue ne connaît plus
 *   l'article : la mercuriale garde sa ligne, et l'écran doit pouvoir dire
 *   qu'elle ne vise plus rien.
 * @param authors nomme qui l'a établie — résolu d'un coup pour toutes les
 *   mercuriales de la lecture (`architecture-journalisation.md` §12, D3).
 * @param reservedElsewhere étiquette une ligne dont l'article a été réservé à
 *   un autre compte après la pose (Q1) ; personne par défaut.
 */
export function posedMercurialeView(
  mercuriale: CompanyMercuriale,
  at: Date,
  nameOf: ProductNamer,
  authors: StaffAuthors,
  reservedElsewhere: ReservedElsewhere = NOWHERE,
): PosedMercurialeView {
  const state = mercuriale.toPersistence();
  const lines = linesOf(mercuriale, at, nameOf, reservedElsewhere);
  return {
    id: state.id,
    label: state.label,
    validFrom: state.validFrom.toISOString(),
    validTo: state.validTo?.toISOString() ?? null,
    status: statusOf(mercuriale, at),
    // Le nombre de PALIERS. Le champ s'appelle encore `ruleCount` parce qu'un
    // front en ligne le lit ; il est déprécié au contrat.
    ruleCount: lines.length,
    // Les articles DISTINCTS : une grille à trois paliers sur vingt articles
    // pèse soixante lignes et vingt articles. Annoncer soixante ferait passer le
    // nombre de paliers pour l'étendue de la négociation.
    skuCount: new Set(lines.map((line) => line.sku)).size,
    createdBy: state.createdBy,
    createdByName: authors.nameOf(state.createdBy),
    lines,
    amendments: amendmentsOf(mercuriale, authors),
    // À son début si elle n'a pas commencé : c'est la politique qu'elle aura.
    promotionPolicy: policyOf(
      mercuriale.promotionPolicyAt(at.getTime() < state.validFrom.getTime() ? state.validFrom : at),
    ),
    initialPromotionPolicy: policyOf(state.promotionPolicy),
  };
}

function policyOf(policy: PromotionAdmission): MercurialePromotionPolicyView {
  return { mode: policy.mode, promotionIds: [...policy.promotionIds] };
}

function policyView(policy: PromotionAdmission | null): MercurialePromotionPolicyView | null {
  return policy === null ? null : policyOf(policy);
}
