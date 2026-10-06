import { BinType } from "../../entities/bin-type.js";
import {
  DefaultContainerBinTypeArchiveError,
  DefaultContainerBinTypeUnavailableError,
} from "../../errors/delivery-composition-errors.js";
import {
  ensureDefaultContainerInService,
  ensureNotDefaultContainer,
} from "../default-container.js";

const manne = BinType.declare({
  id: "manne",
  name: "Manne",
  outer: { lengthMm: 665, widthMm: 460, heightMm: 300 },
  inner: { lengthMm: 640, widthMm: 430, heightMm: 280 },
  isotherm: false,
  maxStack: 6,
  divisible: false,
  at: new Date(0),
});

describe("le contenant par défaut cite un type en service (2026-10-06)", () => {
  it("sans réglage, rien à vérifier", () => {
    expect(() => ensureDefaultContainerInService(null, [])).not.toThrow();
    expect(() => ensureNotDefaultContainer(manne, null)).not.toThrow();
  });

  it("refuse un type hors des types en service", () => {
    expect(() =>
      ensureDefaultContainerInService({ binTypeId: "manne", count: 1 }, ["bac_m"]),
    ).toThrow(DefaultContainerBinTypeUnavailableError);
    expect(() =>
      ensureDefaultContainerInService({ binTypeId: "manne", count: 1 }, ["manne"]),
    ).not.toThrow();
  });

  it("refuse d'archiver le type choisi, en le nommant ; un autre type passe", () => {
    expect(() => ensureNotDefaultContainer(manne, { binTypeId: "manne", count: 2 })).toThrow(
      DefaultContainerBinTypeArchiveError,
    );
    expect(() => ensureNotDefaultContainer(manne, { binTypeId: "manne", count: 2 })).toThrow(
      /« Manne »/u,
    );
    expect(() => ensureNotDefaultContainer(manne, { binTypeId: "bac_m", count: 2 })).not.toThrow();
  });
});
