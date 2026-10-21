import {
  CorrectLegalEntityCommand,
  SetInvoicePaymentTermsCommand,
} from "../../b2b/accounting/application/commands/legal-entity-commands.js";
import { InvoiceSeedPrerequisiteError } from "./invoice-seed-errors.js";
import { asStaff, type SeedContext } from "./order-placing.seed.js";

/**
 * **L'entité émettrice, prête à facturer** — et les deux mises en service
 * abaissées au début du scénario.
 *
 * ## Le numéro de TVA de l'entité est DÉRIVÉ, pas inventé
 *
 * `accounting.seed.ts` le laisse vide « parce que nous ne calculons pas la
 * clé » (lu le 2026-10-21). Sans lui, la facture est refusée
 * (`seller_incomplete`). La clé française est publique et se calcule depuis
 * le SIREN — `(12 + 3 × (SIREN mod 97)) mod 97` — : le numéro posé ici est
 * celui que l'administration attribuerait au SIREN factice `900000001`, pas
 * une valeur au hasard. Posé par la correction de l'entité, comme à l'écran,
 * et seulement s'il manque.
 *
 * ## Les planchers, la seule écriture directe — et pourquoi
 *
 * `invoicing_floor` et `collection_floor` sont des marques de MISE EN SERVICE
 * posées par migration (`20261008200000_la_facture_du_mois`), sans geste ni
 * commande : en développement, la facture du mois n'ouvre qu'au 1er du mois
 * qui suit la migration, donc aucune facture passée n'existerait. Le semis
 * les abaisse — jamais ne les relève — au début de son calendrier, comme le
 * font les e2e (`my-invoices.e2e-spec.ts`). Conséquence assumée sur le poste :
 * les bons des autres clients passés depuis cette date relèvent désormais de
 * la facture du mois, plus de l'ancien arrêté.
 */

/** Les mentions de paiement, reprises des e2e — les bornes légales les acceptent. */
const PAYMENT_TERMS = {
  latePenaltyRateBasisPoints: 1_415,
  recoveryIndemnityCents: 4_000,
  earlyPaymentDiscount: "néant",
} as const;

const VAT_KEY_BASE = 12;
const VAT_KEY_FACTOR = 3;
const VAT_KEY_MODULO = 97;

/** Le numéro de TVA intracommunautaire français d'un SIREN. */
export function frenchVatNumberOf(siren: string): string {
  const remainder = Number(BigInt(siren) % BigInt(VAT_KEY_MODULO));
  const key = (VAT_KEY_BASE + VAT_KEY_FACTOR * remainder) % VAT_KEY_MODULO;
  return `FR${String(key).padStart(2, "0")}${siren}`;
}

/** L'entité en service ; ses manques posés par les mêmes commandes que l'écran. */
export async function readyLegalEntity(context: SeedContext, at: Date): Promise<string> {
  const entity = await context.prisma.legalEntity.findFirst({
    where: { archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (entity === null) {
    throw new InvoiceSeedPrerequisiteError(
      "Aucune entité émettrice en service",
      "lancer `pnpm --filter lfd-api db:seed`",
    );
  }
  await asStaff(at, async () => {
    if (entity.vatNumber.trim() === "") {
      await context.commands.execute(
        new CorrectLegalEntityCommand(entity.id, {
          name: entity.name,
          legalForm: entity.legalForm,
          rcs: entity.rcs,
          shareCapitalCents: entity.shareCapitalCents,
          vatNumber: frenchVatNumberOf(entity.siren),
          address: {
            line1: entity.addressLine1,
            line2: entity.addressLine2,
            postalCode: entity.postalCode,
            city: entity.city,
            countryCode: entity.countryCode,
          },
        }),
      );
    }
    const unset =
      entity.invoiceLatePenaltyRateBasisPoints === null ||
      entity.invoiceRecoveryIndemnityCents === null ||
      entity.invoiceEarlyPaymentDiscount === null;
    if (unset) {
      await context.commands.execute(new SetInvoicePaymentTermsCommand(entity.id, PAYMENT_TERMS));
    }
  });
  return entity.id;
}

/** Abaisse les deux mises en service à `floorAt` ; une marque déjà plus basse reste. */
export async function lowerFloors(context: SeedContext, floorAt: Date): Promise<void> {
  const where = { id: true, floorAt: { gt: floorAt } };
  await context.prisma.invoicingFloor.updateMany({ where, data: { floorAt } });
  await context.prisma.collectionFloor.updateMany({ where, data: { floorAt } });
}

/** La fiche staff locale qui signe les gestes de la comptabilité. */
export async function accountingStaffId(context: SeedContext): Promise<string> {
  const staff = await context.prisma.staffUser.findFirst({
    where: { status: "active", roleKey: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (staff === null) {
    throw new InvoiceSeedPrerequisiteError(
      "Aucune fiche staff administrateur active",
      "lancer `pnpm --filter lfd-api db:seed`",
    );
  }
  return staff.id;
}
