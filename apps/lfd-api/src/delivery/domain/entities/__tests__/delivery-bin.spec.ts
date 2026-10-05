import { BinType } from "../bin-type.js";
import { DeliveryBin, type DeliveryBinState } from "../delivery-bin.js";
import { StopLoading, type StopLoadingSnapshot } from "../stop-loading.js";
import {
  BinHalfTakenError,
  BinNotShareableError,
  BinTypeArchivedForDeclarationError,
  BinTypeNotDivisibleError,
  InvalidBinDeclarationCountError,
  InvalidInnerBagsError,
  SharedBinNotAdjacentError,
} from "../../errors/delivery-bin-declaration-errors.js";
import {
  BinLoadedError,
  DeliveryRoundDepartedError,
  InvalidBinCodeError,
} from "../../errors/delivery-loading-errors.js";
import {
  BinDeclaration,
  MAX_WHOLE_BINS_PER_DECLARATION,
} from "../../value-objects/bin-declaration.js";

const AT = new Date(0);
const LATER = new Date(60_000);
const NAMES = { reference: "C-2", partnerReference: "C-1" };

function binType(options: { readonly divisible?: boolean; readonly archived?: boolean } = {}) {
  const subject = BinType.declare({
    id: "t_m",
    name: "Bac M",
    outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
    inner: { lengthCm: 57, widthCm: 37, heightCm: 20 },
    isotherm: false,
    maxStack: 5,
    divisible: options.divisible ?? true,
    at: AT,
  });
  if (options.archived === true) {
    subject.archive(AT);
  }
  return subject;
}

/** Le chargement de `o_2`, dans la tournée `r_1` où passent o_1, o_2, o_3 dans cet ordre. */
function loadingOf(overrides: Partial<StopLoadingSnapshot> = {}): StopLoading {
  return StopLoading.restore({
    stopId: "s_2",
    roundId: "r_1",
    orderId: "o_2",
    serviceDay: "2030-03-12",
    vehicleName: "Kangoo blanc",
    passage: 1,
    departedAt: null,
    roundOrderIds: ["o_1", "o_2", "o_3"],
    bins: [{ id: "b_1", code: "AAAAAA", voided: false, partnerOrderId: null }],
    loads: [],
    ...overrides,
  });
}

function bin(overrides: Partial<DeliveryBinState> = {}): DeliveryBin {
  return DeliveryBin.restore({
    id: "b_1",
    orderId: "o_2",
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

/** La moitié gauche d'un bac physique `p_1`, déclarée pour `o_1`. */
const LEFT_OF_O1 = bin({
  id: "h_1",
  orderId: "o_1",
  half: "left",
  physicalBinId: "p_1",
  code: "HHHHHH",
});

function declaration(whole: number, half = false, innerBags = 0): BinDeclaration {
  return BinDeclaration.of({ binType: binType(), whole, half, innerBags });
}

describe("BinDeclaration — lot 4 bis, tranche B", () => {
  it.each([
    [0, false],
    [MAX_WHOLE_BINS_PER_DECLARATION + 1, false],
    [-1, true],
  ])("refuse %i bacs entiers (moitié : %s)", (whole, half) => {
    expect(() => declaration(whole, half)).toThrow(InvalidBinDeclarationCountError);
  });

  it("une moitié seule est une déclaration ; elle compte pour un", () => {
    expect(declaration(0, true).count).toBe(1);
    expect(declaration(2, true).count).toBe(3);
  });

  it("refuse une moitié sur un type sans cloison, mais pas des bacs entiers", () => {
    expect(() =>
      BinDeclaration.of({
        binType: binType({ divisible: false }),
        whole: 0,
        half: true,
        innerBags: 0,
      }),
    ).toThrow(BinTypeNotDivisibleError);
    expect(
      BinDeclaration.of({
        binType: binType({ divisible: false }),
        whole: 2,
        half: false,
        innerBags: 0,
      }).count,
    ).toBe(2);
  });

  it("refuse un type archivé (v2-7)", () => {
    expect(() =>
      BinDeclaration.of({
        binType: binType({ archived: true }),
        whole: 1,
        half: false,
        innerBags: 0,
      }),
    ).toThrow(BinTypeArchivedForDeclarationError);
  });

  it.each([-1, 51, 1.5])("refuse %s sacs dans un bac", (innerBags) => {
    expect(() => declaration(1, false, innerBags)).toThrow(InvalidInnerBagsError);
  });
});

describe("DeliveryBin.declare — un bac naît quand on le déclare (L4-C16)", () => {
  it("les entiers d'abord, puis la moitié : la gauche d'un bac physique neuf", () => {
    const bins = DeliveryBin.declare({
      orderId: "o_1",
      declaration: declaration(1, true, 2),
      identities: [
        { id: "b_1", code: "a1b2c3" },
        { id: "b_2", code: "ZZZZZZ" },
      ],
      physicalBinId: "p_1",
      at: AT,
      loading: null,
    });

    expect(bins.map((declared) => declared.toSnapshot())).toEqual([
      {
        id: "b_1",
        orderId: "o_1",
        binTypeId: "t_m",
        half: null,
        physicalBinId: null,
        innerBags: 2,
        code: "A1B2C3",
        voidedAt: null,
        createdAt: AT,
      },
      {
        id: "b_2",
        orderId: "o_1",
        binTypeId: "t_m",
        half: "left",
        physicalBinId: "p_1",
        innerBags: 2,
        code: "ZZZZZZ",
        voidedAt: null,
        createdAt: AT,
      },
    ]);
  });

  it("refuse un code hors alphabet Crockford", () => {
    expect(() =>
      DeliveryBin.declare({
        orderId: "o_1",
        declaration: declaration(1),
        identities: [{ id: "b_1", code: "ILOU00" }],
        physicalBinId: "p_1",
        at: AT,
        loading: null,
      }),
    ).toThrow(InvalidBinCodeError);
  });

  it("refuse un bac de plus pour une tournée partie (I6)", () => {
    expect(() =>
      DeliveryBin.declare({
        orderId: "o_2",
        declaration: declaration(1),
        identities: [{ id: "b_2", code: "BBBBBB" }],
        physicalBinId: "p_1",
        at: LATER,
        loading: loadingOf({ departedAt: AT }),
      }),
    ).toThrow(DeliveryRoundDepartedError);
  });
});

describe("DeliveryBin.shareHalf — le bac partagé (v2-4)", () => {
  function share(
    overrides: Partial<Parameters<typeof DeliveryBin.shareHalf>[0]> = {},
  ): DeliveryBin {
    return DeliveryBin.shareHalf({
      orderId: "o_2",
      partner: LEFT_OF_O1,
      liveHalves: [LEFT_OF_O1],
      binType: binType(),
      identity: { id: "h_2", code: "JJJJJJ" },
      innerBags: 1,
      names: NAMES,
      at: LATER,
      loading: loadingOf(),
      ...overrides,
    });
  }

  it("prend l'AUTRE moitié du même bac physique, au même type", () => {
    expect(share().toSnapshot()).toEqual({
      id: "h_2",
      orderId: "o_2",
      binTypeId: "t_m",
      half: "right",
      physicalBinId: "p_1",
      innerBags: 1,
      code: "JJJJJJ",
      voidedAt: null,
      createdAt: LATER,
    });
  });

  it("refuse deux commandes qui ne sont pas à des arrêts consécutifs", () => {
    // o_1 et o_3 sont séparés par o_2.
    const fromO3 = loadingOf({ stopId: "s_3", orderId: "o_3" });

    expect(() => share({ orderId: "o_3", loading: fromO3 })).toThrow(SharedBinNotAdjacentError);
    expect(() => share({ orderId: "o_3", loading: fromO3 })).toThrow(
      "Les commandes C-2 et C-1 ne sont pas à deux arrêts consécutifs d'une même tournée au dépôt",
    );
  });

  it("refuse une commande dans aucune tournée, ou dont la tournée ne porte pas l'autre", () => {
    expect(() => share({ loading: null })).toThrow(SharedBinNotAdjacentError);
    expect(() => share({ loading: loadingOf({ roundOrderIds: ["o_2", "o_9"] }) })).toThrow(
      SharedBinNotAdjacentError,
    );
  });

  it("refuse une tournée partie", () => {
    expect(() => share({ loading: loadingOf({ departedAt: AT }) })).toThrow(
      DeliveryRoundDepartedError,
    );
  });

  it("refuse l'autre moitié déjà prise — jamais deux fois la même, jamais trois moitiés", () => {
    const right = bin({ id: "h_x", orderId: "o_3", half: "right", physicalBinId: "p_1" });

    expect(() => share({ liveHalves: [LEFT_OF_O1, right] })).toThrow(BinHalfTakenError);
  });

  it.each([
    ["un bac entier", bin({ id: "w_1", orderId: "o_1" }), "est un bac entier"],
    ["une moitié annulée", bin({ ...LEFT_OF_O1.toSnapshot(), voidedAt: AT }), "a été annulé"],
    [
      "une moitié de la même commande",
      bin({ ...LEFT_OF_O1.toSnapshot(), orderId: "o_2" }),
      "appartient déjà",
    ],
  ])("refuse de partager %s", (_label, partner, words) => {
    expect(() => share({ partner, liveHalves: [partner] })).toThrow(BinNotShareableError);
    expect(() => share({ partner, liveHalves: [partner] })).toThrow(words);
  });

  it("refuse un type archivé depuis", () => {
    expect(() => share({ binType: binType({ archived: true }) })).toThrow(
      BinTypeArchivedForDeclarationError,
    );
  });
});

describe("DeliveryBin.void — L4-C19", () => {
  it("annule un bac non chargé, ou d'une commande dans aucune tournée", () => {
    const subject = bin();

    expect(subject.void(LATER, null)).toBe(true);
    expect(subject.voidedAt).toEqual(LATER);
  });

  it("annuler deux fois n'écrit rien la seconde", () => {
    const subject = bin();
    subject.void(LATER, loadingOf());

    expect(subject.void(LATER, loadingOf())).toBe(false);
  });

  it("refuse un bac chargé : décharger d'abord", () => {
    const loaded = loadingOf({
      loads: [
        {
          id: "l_1",
          binId: "b_1",
          loadedAt: AT,
          loadedBy: "staff_1",
          loadedVia: "scan",
          createdAt: AT,
        },
      ],
    });

    expect(() => bin().void(LATER, loaded)).toThrow(BinLoadedError);
  });

  it("refuse après le départ de sa tournée", () => {
    expect(() => bin().void(LATER, loadingOf({ departedAt: AT }))).toThrow(
      DeliveryRoundDepartedError,
    );
  });
});

describe("DeliveryBin.ensureAtHand — le colisage rouvre une commande (K3a)", () => {
  it("laisse passer un bac au dépôt, non chargé, ou hors de toute tournée", () => {
    expect(() => bin().ensureAtHand(null)).not.toThrow();
    expect(() => bin().ensureAtHand(loadingOf())).not.toThrow();
  });

  it("refuse un bac chargé, sans rien écrire", () => {
    const subject = bin();
    const loaded = loadingOf({
      loads: [
        {
          id: "l_1",
          binId: "b_1",
          loadedAt: AT,
          loadedBy: "staff_1",
          loadedVia: "scan",
          createdAt: AT,
        },
      ],
    });

    expect(() => subject.ensureAtHand(loaded)).toThrow(BinLoadedError);
    expect(subject.voidedAt).toBeNull();
  });

  it("refuse après le départ de sa tournée", () => {
    expect(() => bin().ensureAtHand(loadingOf({ departedAt: AT }))).toThrow(
      DeliveryRoundDepartedError,
    );
  });
});
