import type { AppError } from "../../../../platform/shared/errors/app-error.js";
import {
  CollectionTestAmbiguousMandateError,
  CollectionTestDebtorInactiveError,
  CollectionTestNoMandateError,
  CollectionTestOneOffUsedError,
  CollectionTestSequenceMismatchError,
  NotOwnEstablishmentError,
} from "../errors/collection-test-errors.js";
import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { TestSequence } from "./pain008-document.js";

/** Le statut d'une société qui se prélève, même à l'essai. */
const ACTIVE_STATUS = "active";

/**
 * Les séquences qu'un essai admet par type de mandat (Q7, Hugo 2026-10-22).
 * Exhaustive sur `MandatePaymentType`. `FNAL` n'y est nulle part : il n'est
 * pas dans `TestSequence`, il est donc inexprimable.
 */
const SEQUENCES_BY_PAYMENT_TYPE: Readonly<Record<MandatePaymentType, readonly TestSequence[]>> = {
  recurrent: ["RCUR", "FRST"],
  one_off: ["OOFF"],
};

/** Ce qu'il faut savoir d'une société pour juger un essai sur elle. */
export interface TestDebtorFacts {
  readonly companyName: string;
  readonly companyStatus: string;
  /** Déclarée (et pas retirée) parmi nos établissements. */
  readonly declared: boolean;
  /** Ses mandats actifs, tous créanciers confondus. */
  readonly mandates: readonly CollectionMandate[];
  /** Parmi eux, ceux qu'une ligne d'un lot réel non annulé porte. */
  readonly batchedMandateIds: ReadonlySet<string>;
}

/** Un mandat sous lequel prélever, avec son créancier connu. */
export type TestMandate = CollectionMandate & { readonly creditorId: string };

export type TestDebtorVerdict =
  | {
      readonly kind: "eligible";
      readonly mandate: TestMandate;
      readonly sequences: readonly TestSequence[];
    }
  | { readonly kind: "refused"; readonly refusal: AppError };

/**
 * **Peut-on faire un essai sur cette société ?** Une seule règle pour l'écran
 * (qui affiche le refus) et pour la génération (qui le lève) : déclarée à
 * nous, active, un et un seul mandat actif chez une de nos entités, et une
 * séquence encore possible — un mandat ponctuel qu'un lot réel a pris n'en a
 * plus aucune.
 */
export function judgeTestDebtor(facts: TestDebtorFacts): TestDebtorVerdict {
  const refused = (refusal: AppError): TestDebtorVerdict => ({ kind: "refused", refusal });
  if (!facts.declared) {
    return refused(new NotOwnEstablishmentError(facts.companyName));
  }
  if (facts.companyStatus !== ACTIVE_STATUS) {
    return refused(new CollectionTestDebtorInactiveError(facts.companyName, facts.companyStatus));
  }
  const own = ownSingleMandate(facts.companyName, facts.mandates);
  if (own.kind === "refused") {
    return own;
  }
  const { mandate } = own;
  const sequences = testSequencesOf(mandate, facts.batchedMandateIds);
  if (sequences.length === 0) {
    return refused(new CollectionTestOneOffUsedError(mandate.reference));
  }
  return { kind: "eligible", mandate, sequences };
}

/**
 * Le seul mandat actif de la société chez une de nos entités — celui sous
 * lequel un essai prélève, et celui que l'essai exporte pour la banque.
 * Plusieurs : choisir serait deviner le créancier ; aucun : rien à prélever.
 */
export function ownSingleMandate(
  companyName: string,
  mandates: readonly CollectionMandate[],
):
  | { readonly kind: "found"; readonly mandate: TestMandate }
  | { readonly kind: "refused"; readonly refusal: AppError } {
  const ours = mandates.filter((mandate): mandate is TestMandate => mandate.creditorId !== null);
  const [mandate, ...others] = ours;
  if (mandate === undefined) {
    return { kind: "refused", refusal: new CollectionTestNoMandateError(companyName) };
  }
  if (others.length > 0) {
    return {
      kind: "refused",
      refusal: new CollectionTestAmbiguousMandateError(
        companyName,
        ours.map((each) => each.reference),
      ),
    };
  }
  return { kind: "found", mandate };
}

/** Les séquences encore possibles sur ce mandat. */
function testSequencesOf(
  mandate: CollectionMandate,
  batchedMandateIds: ReadonlySet<string>,
): readonly TestSequence[] {
  if (mandate.paymentType === "one_off" && batchedMandateIds.has(mandate.mandateId)) {
    return [];
  }
  return SEQUENCES_BY_PAYMENT_TYPE[mandate.paymentType];
}

/**
 * La séquence demandée est-elle permise ? Rend-la, ou lève le refus nommé.
 *
 * @throws {CollectionTestSequenceMismatchError}
 */
export function admittedSequence(
  verdict: Extract<TestDebtorVerdict, { kind: "eligible" }>,
  sequence: TestSequence,
): TestSequence {
  if (!verdict.sequences.includes(sequence)) {
    throw new CollectionTestSequenceMismatchError(
      sequence,
      verdict.mandate.reference,
      verdict.sequences,
    );
  }
  return sequence;
}
