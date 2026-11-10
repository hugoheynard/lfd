import type { CollectionMandate } from "../../ports/collection-mandates.reader.js";
import type { BillingFollow } from "../../ports/statement-billing.reader.js";
import type { CollectionFormName } from "../../value-objects/collection-form.js";
import { judgeMandate, type Verdict, type VerdictContext } from "../collection-verdict.js";
import { ENTITY_ID, mandate } from "./collection-fixtures.js";

/**
 * Table des sorties de `judgeMandate` — le verrou que pose la note
 * `prelevement-sepa.md` § 12 bis : le compte des clients rejoue ce jugement,
 * il ne le réécrit pas. Les dates ne sont comparées qu'entre elles.
 */
const PLACED = new Date("2026-09-15T08:00:00.000Z");
const AT = new Date("2026-09-30T22:00:00.000Z");

function follow(validTo: Date | null): BillingFollow {
  return { companyId: "s", payerId: "p", payerName: "p", validFrom: new Date(0), validTo };
}

function context(overrides: {
  readonly follows?: readonly BillingFollow[];
  readonly mandates?: readonly CollectionMandate[];
  readonly forms?: ReadonlyMap<string, CollectionFormName>;
  readonly consumed?: readonly string[];
  readonly liveSchemes?: VerdictContext["liveSchemes"];
}): VerdictContext {
  return {
    legalEntityId: ENTITY_ID,
    at: AT,
    follows: overrides.follows ?? [],
    mandates: overrides.mandates ?? [],
    collectionForms: overrides.forms ?? new Map(),
    consumedMandates: new Set(overrides.consumed ?? []),
    liveSchemes: overrides.liveSchemes ?? [],
  };
}

const own = { companyId: "a", placedAt: PLACED, billedCompanyId: "a" };
const siteOrder = { companyId: "s", placedAt: PLACED, billedCompanyId: "p" };

interface Row {
  readonly label: string;
  readonly order: typeof own;
  readonly ctx: VerdictContext;
  readonly kind: Verdict["kind"];
  readonly reason: string | null;
}

const TABLE: readonly Row[] = [
  {
    label: "débit",
    order: own,
    ctx: context({ mandates: [mandate("a")] }),
    kind: "debit",
    reason: null,
  },
  {
    label: "payeur détaché",
    order: siteOrder,
    ctx: context({ follows: [follow(PLACED)] }),
    kind: "exclude",
    reason: "payer_detached",
  },
  { label: "sans mandat", order: own, ctx: context({}), kind: "exclude", reason: "no_mandate" },
  {
    label: "créancier ambigu",
    order: own,
    ctx: context({
      mandates: [mandate("a"), mandate("a", { mandateId: "m2", creditorId: "le_2" })],
    }),
    kind: "exclude",
    reason: "ambiguous_creditor",
  },
  {
    label: "ailleurs (autre créancier)",
    order: own,
    ctx: context({ mandates: [mandate("a", { creditorId: "le_2" })] }),
    kind: "elsewhere",
    reason: null,
  },
  {
    label: "ponctuel consommé",
    order: own,
    ctx: context({ mandates: [mandate("a", { paymentType: "one_off" })], consumed: ["m_a"] }),
    kind: "exclude",
    reason: "one_off_consumed",
  },
  {
    label: "ailleurs (schéma déjà pris)",
    order: own,
    ctx: context({ mandates: [mandate("a")], liveSchemes: ["B2B"] }),
    kind: "elsewhere",
    reason: null,
  },
];

describe("judgeMandate — une sortie par jugement, dans l'ordre", () => {
  it.each(TABLE)("$label", ({ order, ctx, kind, reason }) => {
    const verdict = judgeMandate(order, ctx);
    expect(verdict.kind).toBe(kind);
    expect(verdict.kind === "exclude" ? verdict.reason : null).toBe(reason);
  });

  it("forme 2 sans mandat de site : `no_mandate` nomme le SITE, pas le principal", () => {
    const verdict = judgeMandate(
      siteOrder,
      context({
        follows: [follow(null)],
        mandates: [mandate("p")],
        forms: new Map([["s", "own_mandate_principal_iban"]]),
      }),
    );
    expect(verdict).toEqual({ kind: "exclude", reason: "no_mandate", payerId: "s" });
  });

  it("l'ordre compte : détaché ET sans mandat rend `payer_detached`", () => {
    expect(judgeMandate(siteOrder, context({ follows: [follow(PLACED)] }))).toEqual({
      kind: "exclude",
      reason: "payer_detached",
      payerId: "p",
    });
  });
});
