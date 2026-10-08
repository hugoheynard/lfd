import { historyCell, placeCell } from "../invoice-dossier-history-cells.js";
import {
  neverHandedOver,
  orderHistory,
  type DossierHandoverFact,
  type DossierStopFact,
} from "../invoice-dossier-history.js";

/** Dates absolues comparées entre elles seulement — jamais à l'horloge (CLAUDE.md §5). */
const at = (iso: string): Date => new Date(iso);

const COUNTER: DossierHandoverFact = {
  handedOverAt: at("2026-09-14T07:30:00.000Z"),
  via: "manual",
  atDoor: false,
};

function stop(overrides: Partial<DossierStopFact>): DossierStopFact {
  return {
    serviceDay: "2026-09-15",
    placedAt: at("2026-09-14T15:00:00.000Z"),
    departedAt: at("2026-09-15T06:00:00.000Z"),
    closedAt: at("2026-09-15T09:00:00.000Z"),
    broughtBackAt: null,
    ...overrides,
  };
}

describe("orderHistory", () => {
  it("un retrait au comptoir : un fait, sa voie, et aucune date de tournée", () => {
    const history = orderHistory(COUNTER, []);

    expect(history.events).toEqual([
      { kind: "handed_over", at: COUNTER.handedOverAt, serviceDay: null, via: "manual" },
    ]);
    expect(history.handedOver).toBe(true);
    expect(history.actualDeliveryDay).toBeNull();
  });

  it("un dépôt se lit « déposé », même avec une preuve", () => {
    const history = orderHistory(
      { handedOverAt: at("2026-09-15T09:00:00.000Z"), via: "deposit", atDoor: true },
      [stop({})],
    );

    expect(history.events.map((event) => event.kind)).toEqual(["departed", "deposited"]);
    expect(history.actualDeliveryDay).toBe("2026-09-15");
  });

  it("rapporté puis replacé : la frise le dit, et la date réelle est celle de la tournée qui a livré", () => {
    const first = stop({ broughtBackAt: at("2026-09-15T08:00:00.000Z") });
    const second = stop({
      serviceDay: "2026-09-17",
      placedAt: at("2026-09-16T10:00:00.000Z"),
      departedAt: at("2026-09-17T06:00:00.000Z"),
      closedAt: at("2026-09-17T08:00:00.000Z"),
    });
    const handover = {
      handedOverAt: at("2026-09-17T08:00:00.000Z"),
      via: "scan",
      atDoor: true,
    } as const;

    const history = orderHistory(handover, [second, first]);

    expect(history.events.map((event) => [event.kind, event.serviceDay])).toEqual([
      ["departed", "2026-09-15"],
      ["brought_back", "2026-09-15"],
      ["replaced", "2026-09-17"],
      ["departed", "2026-09-17"],
      ["handed_over_at_door", null],
    ]);
    expect(history.actualDeliveryDay).toBe("2026-09-17");
  });

  it("rapporté et pas encore replacé : aucun retrait, aucune date de livraison", () => {
    const history = orderHistory(null, [stop({ broughtBackAt: at("2026-09-15T08:00:00.000Z") })]);

    expect(history.handedOver).toBe(false);
    expect(history.actualDeliveryDay).toBeNull();
    expect(history.events.map((event) => event.kind)).toEqual(["departed", "brought_back"]);
  });

  it("une tournée encore au dépôt ne dit pas « parti »", () => {
    expect(orderHistory(null, [stop({ departedAt: null, closedAt: null })]).events).toEqual([]);
  });
});

describe("neverHandedOver", () => {
  it("nomme les bons sans aucun fait de retrait, dans l'ordre du dossier", () => {
    const record = (reference: string, handover: DossierHandoverFact | null) => ({
      order: { reference },
      history: orderHistory(handover, []),
    });
    const records = [record("CMD-1", null), record("CMD-2", COUNTER), record("CMD-3", null)];

    expect(neverHandedOver(records)).toEqual(["CMD-1", "CMD-3"]);
  });
});

describe("les cellules CSV", () => {
  it("dit le lieu en toutes lettres, avec ou sans adresse", () => {
    expect(placeCell({ method: "delivery", label: null, address: "3 rue Y, 69001 Lyon" })).toBe(
      "Livraison — 3 rue Y, 69001 Lyon",
    );
    expect(placeCell({ method: "pickup", label: null, address: null })).toBe("Retrait");
  });

  it("écrit la frise, et « aucun fait de retrait » quand il n'y en a pas", () => {
    expect(historyCell(orderHistory(COUNTER, []))).toBe(
      "retiré au comptoir 2026-09-14T07:30:00.000Z (saisie)",
    );
    expect(historyCell(orderHistory(null, [stop({ closedAt: null })]))).toBe(
      "parti en tournée 2026-09-15T06:00:00.000Z (tournée du 2026-09-15) · aucun fait de retrait",
    );
  });
});
