/**
 * Scène partagée par les suites `billing-mode-*.e2e-spec.ts`, découpées par étape
 * le 2026-10-23 : boot, remise à zéro, et les mises en place communes.
 *
 * E2E des **dates des modes** et du **mode d'un payeur** (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`, §16,
 * lot M1). Remplace l'e2e du rythme unique (R2), retiré en M1.
 *
 * Ce que seul le vrai serveur prouve : les deux tables append-only, leurs
 * CHECK et leurs déclencheurs acceptent ce que le domaine écrit ; la fiche et
 * la lecture du payeur relisent le programmé ; un second changement est refusé
 * en 409 ; l'annulation pose `cancelled_at` sans rien effacer ; un site facturé
 * chez un autre est refusé en le nommant ; les faits tombent au journal ; et
 * les routes sont murées par le droit d'écriture comptable.
 *
 * Aucune date absolue : la prise d'effet attendue est calculée par le domaine
 * depuis l'instant présent.
 */
import type { LegalEntityView } from "@lfd/contracts";
import { nextClosureAfter } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { BillingRhythm } from "../src/b2b/accounting/domain/value-objects/billing-rhythm.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";

export const BASE = "/admin/accounting/legal-entities";

/** Le jeton porteur EST le `sub` : le 403 de la seule lecture se joue en base. */
export const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

export let ctx: E2eContext;

export function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

export async function declare(): Promise<string> {
  const response = await staff()
    .post(BASE)
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

export async function read(id: string): Promise<LegalEntityView> {
  return jsonBody<LegalEntityView>(await staff().get(`${BASE}/${id}`).expect(200));
}

export async function modeOf(
  id: string,
  mode: string,
): Promise<LegalEntityView["billingModes"][number]> {
  const found = (await read(id)).billingModes.find((candidate) => candidate.mode === mode);
  if (found === undefined) {
    throw new Error(`mode ${mode} absent de la fiche`);
  }
  return found;
}

/** Le RIB que le mandat débite : sans compte recopié, aucun mandat ne prélève. */
export const DEBTOR_RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};

export let rumSeq = 0;

/**
 * Un mandat B2B actif et signé de cette société chez l'entité, sur son RIB —
 * celui que la constitution du lot prendrait. Écrit comme `collection-batches`.
 */
export async function mandated(entityId: string, companyId: string): Promise<void> {
  rumSeq += 1;
  await staff().put(`/admin/companies/${companyId}/bank-account`).send(DEBTOR_RIB).expect(204);
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId,
      creditorId: entityId,
      reference: `RUM-MODES-${String(rumSeq)}`,
      status: "active",
      acceptedAt: new Date(daysAgo(30)),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
}

/** La prochaine clôture du mensuel au 1er — la prise d'effet de tout premier changement. */
export function nextMonthlyClosure(): string {
  return nextClosureAfter(new Date(daysAgo(0)), BillingRhythm.default()).toISOString();
}

/**
 * Pose la scène pour la suite qui l'appelle : boot, remise à zéro, fermeture.
 * À appeler une fois, au niveau du module de la suite.
 */
export function useBillingModeScene(): void {
  beforeAll(async () => {
    ctx = await bootstrapE2e({
      overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
    });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });
}
