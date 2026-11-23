import type { IssuedCreditNote } from "../../../../accounting/domain/ports/issued-credit-notes.reader.js";
import type { SalesExportOrder } from "../../../../orders/domain/ports/sales-export.reader.js";
import type { SubjectSucceededRefund } from "../../../../../payment/channels/requests/index.js";
import { GetSalesExportHandler } from "../get-sales-export.handler.js";
import { GetSalesExportQuery } from "../get-sales-export.query.js";
import type { SalesExportView } from "../sales-export.view.js";
import {
  StubCategoryNamesReader,
  StubCompanySalesIdentityReader,
  StubIssuedCreditNotesReader,
  StubSalesExportReader,
  StubSucceededCardRefundsReader,
} from "./sales-export.doubles.js";

export const DAY = "2026-03-10";
export const NEXT_DAY = "2026-03-11";
export const REFUNDED_AT = new Date("2026-03-12T10:00:00.000Z");

export interface Scene {
  readonly orders?: readonly SalesExportOrder[];
  readonly notes?: readonly IssuedCreditNote[];
  readonly refunds?: readonly SubjectSucceededRefund[];
}

export function sceneOf(scene: Scene) {
  const readers = {
    sales: new StubSalesExportReader(scene.orders ?? []),
    notes: new StubIssuedCreditNotesReader(scene.notes ?? []),
    names: new StubCategoryNamesReader([{ id: "cat-viennoiserie", name: "Viennoiserie" }]),
    companies: new StubCompanySalesIdentityReader([
      { companyId: "co1", name: "Hôtel du Parc", nafCode: "55.10Z" },
      { companyId: "co2", name: "Le Bistrot", nafCode: null },
    ]),
    refunds: new StubSucceededCardRefundsReader(scene.refunds ?? []),
  };
  const handler = new GetSalesExportHandler(
    readers.sales,
    readers.notes,
    readers.names,
    readers.companies,
    readers.refunds,
  );
  return {
    readers,
    run: (from = DAY, to = NEXT_DAY) => handler.execute(new GetSalesExportQuery(from, to)),
  };
}

export function refund(
  subjectId: string,
  amountCents: number,
  nature: SubjectSucceededRefund["nature"],
) {
  return { subjectId, refundedAt: REFUNDED_AT, amountCents, nature };
}

export function dayOf(view: SalesExportView, day: string) {
  return view.summary.find((line) => line.day === day);
}
