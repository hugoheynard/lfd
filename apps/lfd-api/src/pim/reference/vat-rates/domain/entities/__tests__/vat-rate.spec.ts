import { EmptyVatRateNameError, VatRateInUseError } from "../../errors/vat-rate-errors.js";
import { InvalidVatPercentError } from "../../value-objects/vat-percent.js";
import { VatRate } from "../vat-rate.js";

const OPEN = { id: "tva_1", name: "Réduit", description: "Alimentaire", percent: 5.5 };

describe("l’agrégat VatRate", () => {
  it("refuse un taux impossible", () => {
    expect(() => VatRate.open({ ...OPEN, percent: 0 })).toThrow(InvalidVatPercentError);
  });

  it("refuse un nom vide, à l’ouverture comme à la révision", () => {
    expect(() => VatRate.open({ ...OPEN, name: "   " })).toThrow(EmptyVatRateNameError);
    expect(() => VatRate.open(OPEN).revise({ name: "  ", description: "", percent: 10 })).toThrow(
      EmptyVatRateNameError,
    );
  });

  it("rogne les blancs autour du nom et de la description", () => {
    const snapshot = VatRate.open({
      ...OPEN,
      name: "  Réduit  ",
      description: "  x ",
    }).snapshot();
    expect(snapshot.name).toBe("Réduit");
    expect(snapshot.description).toBe("x");
  });

  /**
   * Le taux repasse par son VO à la reconstitution : une ligne écrite avant que
   * la règle existe se signale ici, plutôt que de ressortir vers un canal.
   */
  it("refuse à la reconstitution un taux que la base n’aurait pas dû porter", () => {
    expect(() => VatRate.reconstitute({ ...OPEN, percent: 0, archivedAt: null })).toThrow(
      InvalidVatPercentError,
    );
  });

  it("révise son taux", () => {
    const rate = VatRate.open(OPEN);
    rate.revise({ name: "Intermédiaire", description: "", percent: 10 });
    expect(rate.snapshot()).toMatchObject({ name: "Intermédiaire", percent: 10 });
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = VatRate.open(OPEN).snapshot();
    expect(VatRate.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});

/** L'instant n'est comparé qu'à lui-même : aucune horloge n'est en jeu. */
const AT = new Date("2026-11-18T09:00:00.000Z");

describe("l’archive d’un taux", () => {
  it("archive un taux que rien ne porte, et le dit archivé", () => {
    const rate = VatRate.open(OPEN);
    expect(rate.archive(AT, 0)).toBe(true);
    expect(rate.isArchived).toBe(true);
    expect(rate.snapshot().archivedAt).toBe(AT);
  });

  it("refuse d’archiver un taux qu’une famille ou une fiche porte encore", () => {
    const rate = VatRate.open(OPEN);
    expect(() => rate.archive(AT, 2)).toThrow(VatRateInUseError);
    expect(rate.isArchived).toBe(false);
  });

  it("ne refait rien sur un taux déjà archivé, même s’il servait entre-temps", () => {
    const rate = VatRate.open(OPEN);
    rate.archive(AT, 0);
    expect(rate.archive(new Date(AT.getTime() + 1000), 3)).toBe(false);
    expect(rate.snapshot().archivedAt).toBe(AT);
  });

  it("se restaure, et rejouer la restauration ne change rien", () => {
    const rate = VatRate.open(OPEN);
    rate.archive(AT, 0);
    expect(rate.restore()).toBe(true);
    expect(rate.isArchived).toBe(false);
    expect(rate.restore()).toBe(false);
  });
});
