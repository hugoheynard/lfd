import type { StoredDocument } from "../../../../../platform/storage/document-store.js";
import {
  PaymentMandate,
  type MandateSnapshot,
  type MandateToCreate,
} from "../../../domain/entities/payment-mandate.js";
import {
  PaymentMandateRepository,
  type MandateHolder,
} from "../../../domain/payment-mandate.repository.js";

/**
 * Les doubles partagés des gestes du staff sur le mandat — révoquer, déposer
 * le scan. `NOW` n'est comparé qu'à une `FixedClock`, jamais au mur.
 */
export const NOW = new Date("2026-08-11T10:00:00.000Z");

/** Ce que les deux mandats de ces cas partagent : la RUM et le compte reconnu. */
const IDENTITY: Pick<MandateSnapshot, "reference" | "last4" | "bankCode" | "country" | "status"> = {
  reference: "RUM-123",
  last4: "3000",
  bankCode: "BNPA",
  country: "FR",
  status: "active",
};

/** Ce que les doubles ont observé — l'ordre des gestes compte autant que leur effet. */
export interface Trace {
  readonly steps: string[];
  written: MandateToCreate | null;
  saved: PaymentMandate | null;
  stored: { key: string; document: StoredDocument } | null;
}

export function doubles(options: {
  readonly current?: PaymentMandate | null;
  readonly draft?: PaymentMandate | null;
  readonly holder?: MandateHolder | null;
}): {
  readonly repo: PaymentMandateRepository;
  readonly trace: Trace;
} {
  const trace: Trace = { steps: [], written: null, saved: null, stored: null };

  const repo: PaymentMandateRepository = {
    findCurrent: () => Promise.resolve(options.current ?? null),
    findById: () => Promise.resolve(null),
    findDraft: () => Promise.resolve(options.draft ?? null),
    findAwaitingProof: () => Promise.resolve(options.draft ?? options.current ?? null),
    create: (mandate) => {
      trace.steps.push("write");
      trace.written = mandate;
      return Promise.resolve("mdt_new");
    },
    save: (mandate) => {
      trace.steps.push("save");
      trace.saved = mandate;
      return Promise.resolve();
    },
    findHolder: () =>
      Promise.resolve(
        options.holder === undefined
          ? {
              companyName: "Café des Halles SAS",
              displayName: "Café des Halles",
              email: "camille@halles.fr",
              reference: "C-7K2M4P",
              siren: "",
            }
          : options.holder,
      ),
    depositProof: (mandate) => {
      trace.steps.push("deposit");
      trace.saved = mandate;
      return Promise.resolve();
    },
  };

  return { repo, trace };
}

/** Le brouillon frappé qui attend son scan — le seul mandat qui en reçoit un. */
export function draftMandate(): PaymentMandate {
  return PaymentMandate.reconstitute({
    scheme: "B2B",
    paymentType: "recurrent",
    ...IDENTITY,
    id: "mdt_1",
    companyId: "cmp_1",
    status: "draft",
    acceptedAt: null,
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
    creditorId: "ent_1",
  });
}

export function activeMandate(): PaymentMandate {
  return PaymentMandate.reconstitute({
    scheme: "B2B",
    paymentType: "recurrent",
    ...IDENTITY,
    id: "mdt_1",
    companyId: "cmp_1",
    acceptedAt: new Date("2024-03-12T00:00:00.000Z"),
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
    creditorId: null,
  });
}
