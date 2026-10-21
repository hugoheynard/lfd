import { GrantTermsCommand } from "../../b2b/account/application/commands/grant-terms.command.js";
import { SetPayerBillingModeCommand } from "../../b2b/accounting/application/commands/set-payer-billing-mode.command.js";
import { AttachMandateProofCommand } from "../../b2b/payments/application/commands/attach-mandate-proof.command.js";
import { MintMandateCommand } from "../../b2b/payments/application/commands/mint-mandate.command.js";
import { SetCompanyBankAccountCommand } from "../../b2b/payments/application/commands/set-company-bank-account.command.js";
import { SignMandateCommand } from "../../b2b/payments/application/commands/sign-mandate.command.js";
import { proofRevisionOf } from "../../b2b/payments/domain/services/proof-revision.js";
import { InvoiceSeedStepError } from "./invoice-seed-errors.js";
import { asStaff, isoDay, type SeedContext } from "./order-placing.seed.js";

/**
 * **Les trois payeurs du groupe des Cimes, prêts à être prélevés** : le
 * règlement au compte (mensuel) accordé, un RIB, un mandat SEPA signé, le
 * mode de facturation hebdomadaire. Chaque geste par la commande de l'écran,
 * à l'instant `at` du calendrier ; chacun seulement s'il manque.
 *
 * Le mandat suit le chemin du back-office : frappe, dépôt du scan, signature
 * sur la pièce relue. Le scan est un PDF minimal — le stockage des pièces
 * (`kbis`) est doublé par le harnais, rien ne part dans un bucket.
 */

/** Un payeur : son identifiant, et le RIB factice qu'il reçoit s'il n'en a pas. */
export interface SeedPayer {
  readonly companyId: string;
  readonly name: string;
  /** La forme juridique du titulaire — zone du mandat, exigée à la frappe. */
  readonly legalForm: string;
  /**
   * ⚠️ **IBAN de remplissage** — code banque et guichet `00000`, qu'aucun
   * établissement ne porte ; clé mod-97 valide pour que `Iban` l'accepte.
   */
  readonly iban: string;
}

const DEBTOR_BIC = "BANQFRPPXXX";
const MANDATE_SCAN = Buffer.from("%PDF-1.4\n%mandat signé (semis)\n", "latin1");

export async function readyPayers(
  context: SeedContext,
  payers: readonly SeedPayer[],
  { at, legalEntityId, staffId }: { at: Date; legalEntityId: string; staffId: string },
): Promise<void> {
  for (const payer of payers) {
    await asStaff(at, async () => {
      await grantMonthlyTerms(context, payer.companyId);
      await ensureBankAccount(context, payer);
      await ensureActiveMandate(context, payer.companyId, at);
      // Idempotent dans le handler : redemander le mode actuel n'est pas un fait.
      await context.commands.execute(
        new SetPayerBillingModeCommand(legalEntityId, payer.companyId, "weekly", staffId),
      );
    });
  }
}

async function grantMonthlyTerms(context: SeedContext, companyId: string): Promise<void> {
  const row = await context.prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { grantedTerms: true },
  });
  if (!row.grantedTerms.includes("monthly")) {
    await context.commands.execute(
      new GrantTermsCommand(companyId, [...row.grantedTerms, "monthly"]),
    );
  }
}

async function ensureBankAccount(context: SeedContext, payer: SeedPayer): Promise<void> {
  const existing = await context.prisma.companyBankAccount.findUnique({
    where: { companyId: payer.companyId },
    select: { companyId: true },
  });
  if (existing !== null) {
    return;
  }
  await context.commands.execute(
    new SetCompanyBankAccountCommand(payer.companyId, {
      iban: payer.iban,
      bic: DEBTOR_BIC,
      holder: payer.name,
      holderLegalForm: payer.legalForm,
      line1: "1 rue du Semis",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    }),
  );
}

/** Frappe, scan, signature — sauf si un mandat est déjà actif. */
async function ensureActiveMandate(context: SeedContext, companyId: string, at: Date) {
  const active = await context.prisma.paymentMandate.findFirst({
    where: { companyId, status: "active" },
    select: { id: true },
  });
  if (active !== null) {
    return;
  }
  const draft = await context.prisma.paymentMandate.findFirst({
    where: { companyId, status: "draft" },
    select: { id: true },
  });
  const mandateId =
    draft?.id ??
    (await context.commands.execute<MintMandateCommand, string>(new MintMandateCommand(companyId)));
  await context.commands.execute(
    new AttachMandateProofCommand(companyId, "mandat-signe.pdf", MANDATE_SCAN),
  );
  const proven = await context.prisma.paymentMandate.findUniqueOrThrow({
    where: { id: mandateId },
    select: { proofStorageKey: true },
  });
  if (proven.proofStorageKey === null) {
    throw new InvoiceSeedStepError(`le scan du mandat de ${companyId} n'a pas été rangé`);
  }
  await context.commands.execute(
    new SignMandateCommand(
      companyId,
      mandateId,
      isoDay(at),
      proofRevisionOf(proven.proofStorageKey),
    ),
  );
}
