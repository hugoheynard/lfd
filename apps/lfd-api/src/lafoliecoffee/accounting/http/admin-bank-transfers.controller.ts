import {
  bankTransferPreviewQuerySchema,
  type BankTransferPreviewView,
  recordBankTransferPayloadSchema,
  type RecordBankTransferPayload,
  type RecordedBankTransferView,
  type UnpaidTransferInvoicesView,
} from "@lfd/contracts";
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { RecordBankTransferCommand } from "../application/commands/record-bank-transfer.command.js";
import { ListUnpaidTransferInvoicesQuery } from "../application/queries/list-unpaid-transfer-invoices.query.js";
import { PreviewBankTransferQuery } from "../application/queries/preview-bank-transfer.query.js";

/** La requête d'aperçu, une fois la chaîne de factures découpée. */
interface PreviewParams {
  readonly amountCents: number;
  readonly invoiceIds: readonly string[];
}

/** Un filtre de chaîne vide vaut « pas de filtre ». */
function filterOf(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

/**
 * **Le virement reçu et les factures au virement à régler** (plan
 * `le-paiement-par-virement.md`, V7, V8, C7).
 *
 * Saisir un virement : `b2b_accounting:write` (déduit du verbe). Lire les
 * factures à régler : la comptabilité, OU la fiche client — comme les impayés
 * de sites détachés, la liste s'affiche aussi sur la fiche du payeur.
 */
@Controller("admin/accounting")
@AdminSurface("b2b_accounting")
export class AdminBankTransfersController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Un virement lu sur le relevé, et les factures au virement qu'il règle.
   * 409 qui dit l'écart en euros si le montant ne fait pas leur reste dû ;
   * 409 qui nomme la facture déjà réglée ou qui n'est pas au virement.
   */
  @Post("legal-entities/:id/bank-transfers")
  async record(
    @Param("id") legalEntityId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
    @Body(new ZodBody(recordBankTransferPayloadSchema)) payload: RecordBankTransferPayload,
  ): Promise<RecordedBankTransferView> {
    const transferId = await this.commands.execute<RecordBankTransferCommand, string>(
      new RecordBankTransferCommand(legalEntityId, payload, staffUserId, intentKey),
    );
    return { transferId };
  }

  /**
   * L'écart avant de valider : le reste dû des factures cochées, le montant
   * et l'écart, par la règle même de la saisie. N'écrit rien ; mêmes refus
   * de facture que la saisie. Lecture de la comptabilité.
   */
  @Get("legal-entities/:id/bank-transfers/preview")
  preview(
    @Param("id") legalEntityId: string,
    @Query(new ZodQuery<PreviewParams>(bankTransferPreviewQuerySchema)) params: PreviewParams,
  ): Promise<BankTransferPreviewView> {
    return this.queries.execute<PreviewBankTransferQuery, BankTransferPreviewView>(
      new PreviewBankTransferQuery(legalEntityId, params.amountCents, params.invoiceIds),
    );
  }

  /** Les factures au virement non réglées, les plus en retard d'abord. */
  @Get("transfer-invoices/unpaid")
  @RequireAnyPermission("b2b_accounting:read", "b2b_companies:read")
  unpaid(
    @Query("legalEntityId") legalEntityId: string | undefined,
    @Query("payerCompanyId") payerCompanyId: string | undefined,
    @Query("overdue") overdue: string | undefined,
  ): Promise<UnpaidTransferInvoicesView> {
    return this.queries.execute<ListUnpaidTransferInvoicesQuery, UnpaidTransferInvoicesView>(
      new ListUnpaidTransferInvoicesQuery(
        filterOf(legalEntityId),
        filterOf(payerCompanyId),
        overdue === "true",
      ),
    );
  }
}
