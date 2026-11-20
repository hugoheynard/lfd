import { z } from "zod";

import { Prisma } from "../../../../platform/database/client/client.js";
import { Invoice } from "../../domain/entities/invoice.js";
import {
  breakdownOf,
  issuedInvoice,
  issueInput,
  line,
} from "../../domain/entities/__tests__/invoice-fixtures.js";
import { UnreadableInvoiceError } from "../../domain/errors/invoice-errors.js";
import { InvoiceNumber } from "../../domain/value-objects/invoice-number.js";
import { toInvoice, toInvoiceCreate, type InvoiceRow } from "../invoice.mapper.js";

/**
 * Le mapper de la facture émise (lot E2) : ce qu'il écrit se relit à
 * l'identique par `Invoice.restore`, et une colonne hors schéma est refusée.
 */

/** Ce que Postgres rend d'un `jsonb` : la valeur écrite, relue sans cast. */
function stored(value: unknown): Prisma.JsonValue {
  return value === undefined ? null : z.json().parse(JSON.parse(JSON.stringify(value)));
}

/** Une colonne `jsonb` nullable : `Prisma.DbNull` s'écrit NULL. */
function storedOrNull(value: unknown): Prisma.JsonValue {
  return value === undefined || value === Prisma.DbNull ? null : stored(value);
}

function dateOf(value: string | Date | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value);
}

/** La ligne que la base rendrait après `create` — bons dans leur rang d'écriture. */
function rowOf(invoice: Invoice, correctsNumber: string | null = null): InvoiceRow {
  const data = toInvoiceCreate(invoice);
  const created = data.orders?.create;
  const orders = Array.isArray(created) ? created : [];
  return {
    id: data.id,
    legalEntityId: data.legalEntityId,
    number: data.number,
    invoicePrefix: data.invoicePrefix,
    year: data.year,
    rank: data.rank,
    type: data.type,
    correctsInvoiceId: data.correctsInvoiceId ?? null,
    issuedOn: new Date(data.issuedOn),
    dueOn: dateOf(data.dueOn),
    seller: stored(data.seller),
    buyer: stored(data.buyer),
    payerCompanyId: data.payerCompanyId,
    mentions: stored(data.mentions),
    lines: stored(data.lines),
    vatBreakdown: stored(data.vatBreakdown),
    totalHtCents: data.totalHtCents,
    totalVatCents: data.totalVatCents,
    totalTtcCents: data.totalTtcCents,
    deliveryAddress: data.deliveryAddress === undefined ? null : stored(data.deliveryAddress),
    bodyVersion: data.bodyVersion,
    documentKey: data.documentKey ?? null,
    documentSha256: data.documentSha256 ?? null,
    paymentMeans: data.paymentMeans === undefined ? null : stored(data.paymentMeans),
    prepaidCents: data.prepaidCents ?? null,
    paidOn: dateOf(data.paidOn),
    budgetCommitmentNumber: data.budgetCommitmentNumber ?? null,
    budgetCommitmentServiceCode: data.budgetCommitmentServiceCode ?? null,
    createdAt: new Date(0),
    orders: orders
      .map((order) => ({
        invoiceId: data.id,
        invoiceType: data.type,
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        receivedOn: dateOf(order.receivedOn),
        deliveryNoteNumbers: Array.isArray(order.deliveryNoteNumbers)
          ? [...order.deliveryNoteNumbers]
          : [],
        freeDelivery: storedOrNull(order.freeDelivery),
        position: order.position,
      }))
      .sort((a, b) => a.position - b.position),
    corrects: correctsNumber === null ? null : { number: correctsNumber },
  };
}

describe("invoice.mapper — écrire puis relire", () => {
  it("relit une facture à l'identique, document compris", () => {
    const invoice = issuedInvoice();
    invoice.attachDocument("invoices/FA-LFD-2026-000001.pdf", "c".repeat(64));

    expect(toInvoice(rowOf(invoice)).toState()).toEqual(invoice.toState());
  });

  it("écrit et relit l'engagement budgétaire ; sans engagement, deux NULL", () => {
    const commitment = { number: "1300012345", serviceCode: "SERV-RH-01" };
    const invoice = Invoice.issue(
      issueInput({ paymentMeans: { code: "58" }, budgetCommitment: commitment }),
    );

    const data = toInvoiceCreate(invoice);

    expect([data.budgetCommitmentNumber, data.budgetCommitmentServiceCode]).toEqual([
      "1300012345",
      "SERV-RH-01",
    ]);
    expect(toInvoice(rowOf(invoice)).toState().budgetCommitment).toEqual(commitment);
    const none = toInvoiceCreate(issuedInvoice());
    expect([none.budgetCommitmentNumber, none.budgetCommitmentServiceCode]).toEqual([null, null]);
  });

  it("écrit l'année et le rang du numéro, le payeur, les totaux de la ventilation", () => {
    const data = toInvoiceCreate(issuedInvoice());

    expect(data).toMatchObject({
      year: 2026,
      rank: 1,
      type: "380",
      payerCompanyId: "c_port",
      bodyVersion: 1,
      totalTtcCents: data.totalHtCents + data.totalVatCents,
    });
    expect(data.deliveryAddress).toBeUndefined();
  });

  it("relit une adresse de livraison distincte", () => {
    const invoice = Invoice.issue(
      issueInput({ deliveryAddressLines: ["Quai 3", "73000 Chambéry"] }),
    );

    expect(toInvoice(rowOf(invoice)).toState().deliveryAddressLines).toEqual([
      "Quai 3",
      "73000 Chambéry",
    ]);
  });

  it("relit un avoir lié à sa facture, sans échéance", () => {
    const corrected = issuedInvoice();
    const lines = [line("PAIN", 5.5, 500)];
    const note = Invoice.creditNote({
      id: "cn_1",
      number: InvoiceNumber.compose("LFD", 2026, 2),
      issuedOn: "2026-10-03",
      corrected,
      priorCreditNotes: [],
      orders: [],
      lines,
      vat: breakdownOf(lines),
    });

    const read = toInvoice(rowOf(note, corrected.number)).toState();

    expect(read).toEqual(note.toState());
    expect(read.dueOn).toBeNull();
  });
});

describe("invoice.mapper — la livraison offerte figée (plan livraison offerte, § 2.9)", () => {
  const offered = Invoice.issue(
    issueInput({
      orders: [
        {
          orderId: "o_1",
          reference: "ORD-001",
          receivedOn: "2026-09-12",
          freeDelivery: {
            waivedCents: 2_400,
            waivedTtcCents: null,
            label: { fr: "Client fidèle", en: "Loyal customer", it: "Cliente fedele" },
          },
        },
        { orderId: "o_2", reference: "ORD-002", receivedOn: "2026-09-13" },
      ],
    }),
  );

  it("l'écrit sur le bon qui l'a, NULL sur l'autre, et la relit à l'identique", () => {
    const created = toInvoiceCreate(offered).orders?.create;
    const orders = Array.isArray(created) ? created : [];

    expect(orders.map((order) => order.freeDelivery)).toEqual([
      {
        waivedCents: 2_400,
        waivedTtcCents: null,
        label: { fr: "Client fidèle", en: "Loyal customer", it: "Cliente fedele" },
      },
      Prisma.DbNull,
    ]);
    expect(toInvoice(rowOf(offered)).toState()).toEqual(offered.toState());
  });

  it("une pièce émise avant (colonne NULL) se relit sans mention", () => {
    const read = toInvoice(rowOf(issuedInvoice())).toState();

    expect(read.orders.every((order) => order.freeDelivery === undefined)).toBe(true);
  });

  it("refuse une mention hors schéma plutôt que de la taire", () => {
    const row = rowOf(offered);
    const orders = row.orders.map((order) => ({ ...order, freeDelivery: { waivedCents: "24" } }));

    expect(() => toInvoice({ ...row, orders })).toThrow(UnreadableInvoiceError);
  });
});

describe("invoice.mapper — refuser une ligne illisible", () => {
  it("refuse une forme inconnue", () => {
    const row = { ...rowOf(issuedInvoice()), bodyVersion: 2 };

    expect(() => toInvoice(row)).toThrow(UnreadableInvoiceError);
  });

  it("refuse des mentions qui prendraient l'option sur les débits", () => {
    const row = rowOf(issuedInvoice());
    const mentions = z.record(z.string(), z.json()).parse(row.mentions);

    expect(() => toInvoice({ ...row, mentions: { ...mentions, vatOnDebits: true } })).toThrow(
      UnreadableInvoiceError,
    );
  });

  it("refuse une ligne dont l'unité n'existe pas", () => {
    const row = rowOf(issuedInvoice());

    expect(() => toInvoice({ ...row, lines: [{ sku: "PAIN", unitCode: "LTR" }] })).toThrow(
      UnreadableInvoiceError,
    );
  });

  it("refuse un type de pièce inconnu", () => {
    const row = { ...rowOf(issuedInvoice()), type: "384" };

    expect(() => toInvoice(row)).toThrow(UnreadableInvoiceError);
  });
});
