import { checkedAdmission } from "./mercuriale-promotion-policy.js";
import {
  AmendmentOutsideMercurialeError,
  DuplicateEndedSkuError,
  DuplicateMercurialeSkuError,
  EmptyAmendmentError,
  EmptyMercurialeError,
  MissingAmendmentReasonError,
  NoNegotiatedLineToEndError,
  NonDecreasingMercurialeTiersError,
  RetroactiveAmendmentError,
  ReversedValidityWindowError,
  SkuAlreadyNegotiatedError,
} from "../pricing-errors.js";
import { normalizeGrid, type GridRefusals } from "../pricing-grid.js";
import type {
  AmendedGrid,
  MercurialeAmendment,
  MercurialeAmendmentDraft,
} from "./mercuriale-amendment.js";
import { covers, overlaps, segmentsOf } from "./mercuriale-segments.js";

/*
 * Les REFUS d'un avenant, confrontés au document qui le reçoit.
 */

/**
 * Les trois refus d'une grille, **dits en mercuriale** — pour la pose comme
 * pour un avenant. Le contrôle est partagé (`pricing-grid.ts`) ; les phrases
 * ne le sont pas : un commercial sur la fiche d'un client ne doit pas lire un
 * message qui parle de gabarit.
 */
export const MERCURIALE_REFUSALS: GridRefusals = {
  empty: () => new EmptyMercurialeError(),
  duplicateSku: (sku) => new DuplicateMercurialeSkuError(sku),
  nonDecreasing: (sku, minQuantity) => new NonDecreasingMercurialeTiersError(sku, minQuantity),
};

/**
 * **Vérifier un avenant** contre le document qui le reçoit, et rendre sa forme
 * normalisée (paliers triés). Le document est supposé non clos : l'agrégat le
 * vérifie avant.
 *
 * @throws {MissingAmendmentReasonError} motif vide ou blanc.
 * @throws {EmptyAmendmentError} ni ligne ouverte, ni ligne arrêtée.
 * @throws {ReversedValidityWindowError} fenêtre inversée ou vide.
 * @throws {AmendmentOutsideMercurialeError} fenêtre hors du document.
 * @throws {RetroactiveAmendmentError} `validFrom` antérieur à `now`.
 * @throws {DuplicateEndedSkuError} la même ligne arrêtée deux fois.
 * @throws {NoNegotiatedLineToEndError} un arrêt qui ne vise aucune ligne en cours.
 * @throws {SkuAlreadyNegotiatedError} un article déjà négocié sur la période.
 */
export function checkedAmendment(
  grid: AmendedGrid,
  draft: MercurialeAmendmentDraft,
  now: Date,
): MercurialeAmendmentDraft {
  if (draft.reason.trim().length === 0) {
    throw new MissingAmendmentReasonError();
  }
  const promotionPolicy = draft.promotionPolicy ?? null;
  // Un avenant qui ne fait que changer la politique de promotions est valide
  // (Hugo, 2026-10-31) : c'est le geste daté qui la fait évoluer.
  if (draft.lines.length === 0 && draft.endedSkus.length === 0 && promotionPolicy === null) {
    throw new EmptyAmendmentError();
  }
  assertWindow(grid, draft, now);
  const lines = draft.lines.length === 0 ? [] : normalizeGrid(draft.lines, MERCURIALE_REFUSALS);
  assertEndsRunningLines(grid, draft);
  return {
    ...draft,
    reason: draft.reason.trim(),
    lines,
    promotionPolicy: promotionPolicy === null ? null : checkedAdmission(promotionPolicy),
  };
}

function assertWindow(grid: AmendedGrid, draft: MercurialeAmendmentDraft, now: Date): void {
  const { validFrom, validTo } = draft;
  if (validTo !== null && validTo.getTime() <= validFrom.getTime()) {
    throw new ReversedValidityWindowError(validFrom, validTo);
  }
  const beforeDocument = validFrom.getTime() < grid.validFrom.getTime();
  const afterDocument =
    grid.validTo !== null &&
    (validFrom.getTime() >= grid.validTo.getTime() ||
      (validTo !== null && validTo.getTime() > grid.validTo.getTime()));
  if (beforeDocument || afterDocument) {
    throw new AmendmentOutsideMercurialeError(grid.validFrom, grid.validTo);
  }
  if (validFrom.getTime() < now.getTime()) {
    throw new RetroactiveAmendmentError(validFrom);
  }
}

function assertEndsRunningLines(grid: AmendedGrid, draft: MercurialeAmendmentDraft): void {
  const seen = new Set<string>();
  for (const sku of draft.endedSkus) {
    if (seen.has(sku)) {
      throw new DuplicateEndedSkuError(sku);
    }
    seen.add(sku);
    if (!segmentsOf(grid, sku, null).some((segment) => covers(segment, draft.validFrom))) {
      throw new NoNegotiatedLineToEndError(sku, draft.validFrom);
    }
  }
}

/**
 * **Le refus de doublon**, une fois l'avenant ajouté : chacune de ses lignes
 * ouvertes ne doit chevaucher aucune autre ligne effective du même article —
 * la grille (si elle n'est pas arrêtée avant) ou un autre avenant.
 *
 * @throws {SkuAlreadyNegotiatedError}
 */
export function assertNoDoubleNegotiation(grid: AmendedGrid, added: MercurialeAmendment): void {
  for (const line of added.lines) {
    const segments = segmentsOf(grid, line.sku, null);
    const mine = segments.find((segment) => segment.amendment?.id === added.id);
    if (mine === undefined) {
      continue;
    }
    const rival = segments.find(
      (segment) => segment.amendment?.id !== added.id && overlaps(segment, mine),
    );
    if (rival !== undefined) {
      throw new SkuAlreadyNegotiatedError(line.sku, rival.amendment?.validFrom ?? null);
    }
  }
}
