import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import {
  PostDeployOperation,
  type OperationReport,
} from "../../../platform/post-deploy/post-deploy-operation.js";

/** La clé stable de l'opération. */
export const ORD_35_IN_HOUSE_OPERATION_KEY = "orders.ord-35-in-house";

/** La commande visée : passée au compte avant que son payeur soit marqué « maison ». */
const ORD_35 = "ORD-35";

/** Ce qu'une commande interne porte en motif (`IN_HOUSE_ORDER_REASON`, domaine des offres). */
const IN_HOUSE_NATURE = "in_house";
const IN_HOUSE_NOTE = "Commande interne";

/** L'état de la commande, relu sous verrou à l'application. */
interface Candidate {
  readonly id: string;
  readonly offer_nature: string | null;
  readonly payment_status: string;
  readonly vat_method: string;
  readonly total_cents: number;
  readonly vat_cents: number;
  readonly payer_in_house: boolean;
  readonly engaged: boolean;
  readonly odd_notes: number;
}

/**
 * **La reprise d'une commande au compte en commande interne** — ce que la
 * passation aurait écrit si le payeur avait été marqué « maison » avant elle
 * (`documentation/comptabilite/facturation/restaurants-maison.md`, § 2).
 *
 * Mesuré contre une commande née interne (e2e
 * `test/ord-35-in-house-conversion.e2e-spec.ts`, le 2026-11-26) : seuls
 * diffèrent l'offre de la commande, ses totaux, ses montants facturables, les
 * totaux de ses BL et la version figée de leur rendu. Lignes, sous-total,
 * remises et frais ne bougent pas.
 *
 * Séparée de l'opération pour que le test vise sa propre commande.
 */
export class InHouseConversion {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly orderNumber: string,
  ) {}

  /** Pourquoi la commande ne se reprend pas ; `null` : elle se reprend. */
  async refusal(lock: boolean): Promise<string | null> {
    const rows = await this.candidate(lock);
    const row = rows[0];
    if (row === undefined) {
      return `La commande ${this.orderNumber} n'existe pas.`;
    }
    return refusalOf(this.orderNumber, row);
  }

  /** Écrit la reprise dans une transaction, gardes rejouées sous verrou ; rend `true` si elle a écrit. */
  apply(): Promise<boolean> {
    return this.uow.run(async () => {
      if ((await this.refusal(true)) !== null) {
        return false;
      }
      await this.rewrite();
      return true;
    });
  }

  private async candidate(lock: boolean): Promise<Candidate[]> {
    if (lock) {
      await this.prisma.$queryRaw`
        SELECT o.id FROM public.orders o WHERE o.order_number = ${this.orderNumber} FOR UPDATE`;
    }
    return this.prisma.$queryRaw<Candidate[]>`
        SELECT o.id, o.offer_nature, o.payment_status::text AS payment_status, o.vat_method,
               o.total_cents, o.vat_cents,
               EXISTS (SELECT 1 FROM public.payer_in_house p
                        WHERE p.company_id = COALESCE(o.billed_company_id, o.company_id)
                          AND p.withdrawn_at IS NULL) AS payer_in_house,
               (EXISTS (SELECT 1 FROM public.invoice_order io WHERE io.order_id = o.id)
                OR EXISTS (SELECT 1 FROM public.billing_statement_order b WHERE b.order_id = o.id)
                OR EXISTS (SELECT 1 FROM public.order_collection c WHERE c.order_id = o.id)) AS engaged,
               (SELECT count(*)::int FROM public.delivery_note n
                 WHERE n.order_id = o.id AND n.voided_at IS NULL AND n.total_cents IS NOT NULL
                   AND (n.total_cents <> o.total_cents OR n.vat_cents <> o.vat_cents)) AS odd_notes
          FROM public.orders o WHERE o.order_number = ${this.orderNumber}`;
  }

  /**
   * La commande prend l'offre `in_house` et sa valeur (l'ancien total),
   * puis tombent à zéro la TVA, ses parts, le total — sur la commande, ses
   * montants facturables s'ils sont posés, ses BL et le rendu figé des BL.
   */
  private async rewrite(): Promise<void> {
    const n = this.orderNumber;
    await this.prisma.$executeRaw`
      UPDATE public.orders SET
        offer_nature = ${IN_HOUSE_NATURE}, offer_note = ${IN_HOUSE_NOTE},
        offer_notifies_customer = true,
        offered_total_cents = total_cents, offered_vat_cents = vat_cents,
        offered_vat_shares = COALESCE(vat_shares, '[]'::jsonb),
        vat_cents = 0, vat_shares = '[]'::jsonb, total_cents = 0,
        ttc_by_rate = CASE WHEN ttc_by_rate IS NULL THEN NULL ELSE '[]'::jsonb END,
        billable_vat_cents = CASE WHEN billable_total_cents IS NULL THEN NULL ELSE 0 END,
        billable_vat_shares = CASE WHEN billable_total_cents IS NULL THEN NULL ELSE '[]'::jsonb END,
        billable_total_cents = CASE WHEN billable_total_cents IS NULL THEN NULL ELSE 0 END
      WHERE order_number = ${n}`;
    await this.prisma.$executeRaw`
      UPDATE public.delivery_note n SET
        vat_cents = 0, vat_shares = '[]'::jsonb, total_cents = 0,
        ttc_by_rate = CASE WHEN n.ttc_by_rate IS NULL THEN NULL ELSE '[]'::jsonb END
      FROM public.orders o
      WHERE n.order_id = o.id AND o.order_number = ${n} AND n.total_cents IS NOT NULL`;
    await this.prisma.$executeRaw`
      UPDATE public.delivery_note_version v SET rendered = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
          v.rendered,
          '{note,money,settlement}', to_jsonb(${IN_HOUSE_NATURE}::text)),
          '{note,money,totalCents}', '0'::jsonb),
          '{note,money,vatCents}', '0'::jsonb),
          '{note,money,vatShares}', '[]'::jsonb)
      FROM public.delivery_note n JOIN public.orders o ON o.id = n.order_id
      WHERE v.delivery_note_id = n.id AND o.order_number = ${n}
        AND v.rendered #> '{note,money}' IS NOT NULL`;
  }
}

function refusalOf(orderNumber: string, row: Candidate): string | null {
  if (row.offer_nature === IN_HOUSE_NATURE) {
    return `La commande ${orderNumber} est déjà interne : rien à faire.`;
  }
  if (row.offer_nature !== null) {
    return `La commande ${orderNumber} est déjà offerte : elle ne se reprend pas.`;
  }
  if (row.payment_status !== "not_required") {
    return `La commande ${orderNumber} n'est pas au compte : elle ne se reprend pas.`;
  }
  if (!row.payer_in_house) {
    return `Le payeur de la commande ${orderNumber} n'est pas marqué « maison » : marquez-le d'abord.`;
  }
  if (row.engaged) {
    return `La commande ${orderNumber} est déjà sur une facture, un relevé ou un prélèvement : elle se reprend par un avoir, pas ici.`;
  }
  if (row.vat_method !== "line_ht" || row.odd_notes > 0) {
    return `La commande ${orderNumber} a un BL partiel ou un calcul TTC : cas non mesuré, à reprendre à la main.`;
  }
  return null;
}

/**
 * **ORD-35 devient une commande interne** — opération d'un seul cas, à
 * retirer par un commit une fois appliquée en production
 * (`documentation/ops/plan-operations-apres-deploiement.md`, § 7.12).
 */
@Injectable()
export class Ord35InHouseOperation extends PostDeployOperation {
  readonly key = ORD_35_IN_HOUSE_OPERATION_KEY;
  readonly title = "ORD-35 en commande interne";
  readonly why =
    "ORD-35 a été passée au compte pour un de nos restaurants avant que la société soit marquée « maison ». " +
    "Elle devient ce que la passation aurait écrit : une commande interne, total nul, sa valeur gardée, hors facture et hors prélèvement.";
  readonly limit =
    "Pas de retour arrière. Le PDF du BL déjà rangé garde ses prix, les e-mails partis et les faits publiés " +
    "disent « au compte » ; le rendu figé du BL est réécrit, un nouveau PDF se régénère depuis la fiche.";
  readonly after: readonly string[] = [];

  private readonly conversion: InHouseConversion;

  constructor(prisma: PrismaService, uow: UnitOfWork) {
    super();
    this.conversion = new InHouseConversion(prisma, uow, ORD_35);
  }

  async simulate(): Promise<OperationReport> {
    return reportOf(await this.conversion.refusal(false), false);
  }

  async apply(): Promise<OperationReport> {
    const refusal = await this.conversion.refusal(false);
    if (refusal !== null) {
      return reportOf(refusal, false);
    }
    const written = await this.conversion.apply();
    return written
      ? reportOf(null, true)
      : reportOf("La commande a changé entre la lecture et l'écriture : rien n'est écrit.", false);
  }
}

function reportOf(refusal: string | null, written: boolean): OperationReport {
  if (refusal !== null) {
    return { writable: 0, byHand: 0, summary: [refusal], sample: [] };
  }
  return {
    writable: 1,
    byHand: 0,
    summary: [written ? "1 commande passée en interne." : "1 commande à passer en interne."],
    sample: [ORD_35],
  };
}
