import { InvalidReceivedTransferError } from "../../errors/received-transfer-errors.js";
import {
  ReceivedTransfer,
  type ReceivedTransferInput,
  TRANSFER_REFERENCE_MAX,
} from "../received-transfer.js";

const RECORDED_AT = new Date(0);

const input = (over: Partial<ReceivedTransferInput> = {}): ReceivedTransferInput => ({
  id: "vir_1",
  receivedInto: "le1",
  payerRef: "cmp_port",
  amountCents: 15_455,
  receivedOn: "2026-11-18",
  reference: "FA-001 FA-002",
  recordedAt: RECORDED_AT,
  recordedBy: "staff_compta",
  parts: [
    { subject: { type: "invoice", id: "inv_1" }, amountCents: 12_000 },
    { subject: { type: "invoice", id: "inv_2" }, amountCents: 3_455 },
  ],
  ...over,
});

describe("ReceivedTransfer — un virement reçu et ses parts", () => {
  it("enregistre un virement dont les parts font le montant, référence nettoyée", () => {
    const transfer = ReceivedTransfer.record(input({ reference: "  FA-001  " }));

    expect(transfer.id).toBe("vir_1");
    expect(transfer.toState()).toMatchObject({ reference: "FA-001", amountCents: 15_455 });
    expect(transfer.toState().parts).toHaveLength(2);
  });

  it.each([
    ["un montant nul", { amountCents: 0 }, /positif/u],
    ["un montant fractionnaire", { amountCents: 10.5 }, /positif/u],
    ["un jour mal formé", { receivedOn: "18/11/2026" }, /n'est pas une date/u],
    ["une référence vide", { reference: "   " }, /référence/u],
    ["une référence trop longue", { reference: "x".repeat(TRANSFER_REFERENCE_MAX + 1) }, /140/u],
    ["une entité vide", { receivedInto: "" }, /obligatoires/u],
    ["un payeur vide", { payerRef: " " }, /obligatoires/u],
    ["aucune part", { parts: [] }, /au moins un sujet/u],
  ])("refuse %s", (_case, over: Partial<ReceivedTransferInput>, message) => {
    expect(() => ReceivedTransfer.record(input(over))).toThrow(InvalidReceivedTransferError);
    expect(() => ReceivedTransfer.record(input(over))).toThrow(message);
  });

  it("refuse une somme des parts qui ne fait pas le montant, en le disant", () => {
    expect(() => ReceivedTransfer.record(input({ amountCents: 15_000 }))).toThrow(
      /somme des parts \(15455 centimes\) ne fait pas le montant \(15000 centimes\)/u,
    );
  });

  it("refuse un sujet cité deux fois", () => {
    const part = { subject: { type: "invoice", id: "inv_1" }, amountCents: 5_000 };

    expect(() =>
      ReceivedTransfer.record(input({ amountCents: 10_000, parts: [part, part] })),
    ).toThrow(/invoice\/inv_1 est cité deux fois/u);
  });

  it("refuse une part non positive, même si la somme tombe juste", () => {
    expect(() =>
      ReceivedTransfer.record(
        input({
          amountCents: 1_000,
          parts: [
            { subject: { type: "invoice", id: "inv_1" }, amountCents: 1_500 },
            { subject: { type: "invoice", id: "inv_2" }, amountCents: -500 },
          ],
        }),
      ),
    ).toThrow(/inv_2 doit être un nombre positif/u);
  });

  it("refuse une part sans sujet nommé", () => {
    expect(() =>
      ReceivedTransfer.record(
        input({
          amountCents: 100,
          parts: [{ subject: { type: "", id: "inv_1" }, amountCents: 100 }],
        }),
      ),
    ).toThrow(/nomme son sujet/u);
  });

  it("le même identifiant de sujet sous deux types n'est pas un doublon", () => {
    const transfer = ReceivedTransfer.record(
      input({
        amountCents: 200,
        parts: [
          { subject: { type: "invoice", id: "x" }, amountCents: 100 },
          { subject: { type: "order", id: "x" }, amountCents: 100 },
        ],
      }),
    );

    expect(transfer.toState().parts).toHaveLength(2);
  });
});
