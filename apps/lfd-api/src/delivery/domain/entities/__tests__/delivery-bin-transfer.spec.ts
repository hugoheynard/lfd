import { BinType } from "../bin-type.js";
import { DeliveryBin } from "../delivery-bin.js";
import { StopLoading, type StopLoadingSnapshot } from "../stop-loading.js";
import { TransferBinHalfError } from "../../errors/delivery-bin-declaration-errors.js";
import { DeliveryRoundDepartedError } from "../../errors/delivery-loading-errors.js";
import { BinDeclaration } from "../../value-objects/bin-declaration.js";

/*
 * **Les bacs d'un transfert interne** (plan du transfert interne, Q-T4
 * révisée par Hugo le 2026-10-13, lot T3) : le bac existant, avec un sujet de
 * plus. Toujours entier ; jamais partagé avec une commande.
 */

const AT = new Date(0);
const LATER = new Date(60_000);
const NAMES = { reference: "C-2", partnerReference: "→ Val Village" };

function binType(): BinType {
  return BinType.declare({
    id: "t_m",
    name: "Bac M",
    outer: { lengthMm: 600, widthMm: 400, heightMm: 220 },
    inner: { lengthMm: 570, widthMm: 370, heightMm: 200 },
    isotherm: false,
    maxStack: 5,
    divisible: true,
    at: AT,
  });
}

function declaration(whole: number, half = false, innerBags = 0): BinDeclaration {
  return BinDeclaration.of({ binType: binType(), whole, half, innerBags });
}

/** Un chargement de la tournée `r_1` ; celui de `o_2` par défaut. */
function loadingOf(overrides: Partial<StopLoadingSnapshot> = {}): StopLoading {
  return StopLoading.restore({
    stopId: "s_2",
    roundId: "r_1",
    subject: { kind: "order", orderId: "o_2" },
    serviceDay: "2030-03-12",
    vehicleName: "Kangoo blanc",
    passage: 1,
    departedAt: null,
    roundOrderIds: ["o_1", "o_2", "o_3"],
    bins: [],
    loads: [],
    ...overrides,
  });
}

function bin(overrides: Partial<Parameters<typeof DeliveryBin.restore>[0]> = {}): DeliveryBin {
  return DeliveryBin.restore({
    id: "b_1",
    subject: { kind: "order", orderId: "o_2" },
    binTypeId: "t_m",
    half: null,
    physicalBinId: null,
    innerBags: 0,
    code: "AAAAAA",
    voidedAt: null,
    createdAt: AT,
    ...overrides,
  });
}

describe("les bacs d'un transfert interne (lot T3, Q-T4 révisée)", () => {
  const TRANSFER = { kind: "transfer", transferId: "t_1" } as const;
  const transferLoading = (overrides: Partial<StopLoadingSnapshot> = {}): StopLoading =>
    loadingOf({
      stopId: "s_t",
      subject: TRANSFER,
      roundOrderIds: ["o_1", null, "o_3"],
      ...overrides,
    });

  it("naissent entiers, au transfert, sans commande", () => {
    const bins = DeliveryBin.declare({
      subject: TRANSFER,
      declaration: declaration(2, false, 4),
      identities: [
        { id: "b_t1", code: "TTTTT1" },
        { id: "b_t2", code: "TTTTT2" },
      ],
      physicalBinId: "p_unused",
      at: AT,
      loading: transferLoading(),
    });

    expect(bins.map((declared) => declared.toSnapshot())).toEqual(
      ["b_t1", "b_t2"].map((id, index) => ({
        id,
        subject: TRANSFER,
        binTypeId: "t_m",
        half: null,
        physicalBinId: null,
        innerBags: 4,
        code: `TTTTT${String(index + 1)}`,
        voidedAt: null,
        createdAt: AT,
      })),
    );
  });

  it("refusent une moitié : le demi-bac ne se partage qu'entre deux commandes voisines", () => {
    expect(() =>
      DeliveryBin.declare({
        subject: TRANSFER,
        declaration: declaration(1, true),
        identities: [
          { id: "b_t1", code: "TTTTT1" },
          { id: "b_t2", code: "TTTTT2" },
        ],
        physicalBinId: "p_1",
        at: AT,
        loading: null,
      }),
    ).toThrow(TransferBinHalfError);
  });

  it("refusent un bac de plus quand la tournée du transfert est partie", () => {
    expect(() =>
      DeliveryBin.declare({
        subject: TRANSFER,
        declaration: declaration(1),
        identities: [{ id: "b_t1", code: "TTTTT1" }],
        physicalBinId: "p_1",
        at: LATER,
        loading: transferLoading({ departedAt: AT }),
      }),
    ).toThrow(DeliveryRoundDepartedError);
  });

  it("ne se partagent jamais avec une commande", () => {
    const transferBin = bin({ id: "b_t1", subject: TRANSFER, code: "TTTTT1" });

    expect(() =>
      DeliveryBin.shareHalf({
        orderId: "o_2",
        partner: transferBin,
        liveHalves: [transferBin],
        binType: binType(),
        identity: { id: "h_2", code: "JJJJJJ" },
        innerBags: 0,
        names: NAMES,
        at: LATER,
        loading: loadingOf(),
      }),
    ).toThrow("appartient à un transfert interne");
  });
});
