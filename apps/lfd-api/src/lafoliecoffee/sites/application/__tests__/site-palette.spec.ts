import type { StoredSiteView } from "@lfd/contracts";

import { SiteReader } from "../../domain/site.reader.js";
import { SiteDeliveryColorsReader } from "../../infrastructure/site-delivery-colors.reader.js";
import { SiteRunSheetColorsReader } from "../../infrastructure/site-run-sheet-colors.reader.js";
import { DepartureDeliveryColors } from "../departure-delivery-colors.js";
import { GetSitePaletteHandler } from "../get-site-palette.handler.js";
import { FixedDepartureSite } from "./site-doubles.js";

/**
 * La palette de la logistique et les couleurs de livraison du départ (plan
 * `commandes/back-office/tri-depart-et-couleurs.md`, L1a, L5) : lues à chaque appel,
 * jamais une couleur inventée.
 */

function site(id: string, overrides: Partial<StoredSiteView> = {}): StoredSiteView {
  return {
    id,
    label: `Site ${id}`,
    ligne1: "1 rue du Four",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
    pays: "FR",
    discounts: { b2b: null, b2c: null },
    opening: { publicOpening: null, proPickup: null },
    pickup: true,
    supply: "on_site",
    deliveryDeparture: false,
    transferMode: "integrated",
    counterSetupMinutes: 0,
    eatIn: false,
    gps: null,
    archivedAt: null,
    pickupColorB2b: null,
    pickupColorB2c: null,
    deliveryColorB2b: null,
    deliveryColorB2c: null,
    resupplyColor: null,
    transferColor: null,
    ...overrides,
  };
}

/** Les sites donnés d'avance ; les lectures comptées. */
class FixedSites extends SiteReader {
  lists = 0;

  constructor(private readonly sites: readonly StoredSiteView[]) {
    super();
  }

  list(): Promise<readonly StoredSiteView[]> {
    this.lists += 1;
    return Promise.resolve(this.sites);
  }

  get(id: string): Promise<StoredSiteView | null> {
    return Promise.resolve(this.sites.find((candidate) => candidate.id === id) ?? null);
  }
}

const FOURNIL = site("fournil", {
  deliveryDeparture: true,
  deliveryColorB2b: "#1e88e5",
  deliveryColorB2c: "#8e24aa",
  pickupColorB2b: "#fdd835",
});
const VILLAGE = site("vv", {
  label: "Val Village",
  supply: "transfer",
  pickupColorB2c: "#9e9e9e",
  resupplyColor: "#26a69a",
  transferColor: null,
  archivedAt: "2026-01-01T00:00:00.000Z",
});

describe("GetSitePaletteHandler — la palette de la logistique (L1a)", () => {
  it("rend l'id, le nom, l'approvisionnement, les couleurs (réassort compris) et le départ — rien d'autre", async () => {
    const handler = new GetSitePaletteHandler(
      new FixedSites([FOURNIL, VILLAGE]),
      new FixedDepartureSite("fournil"),
    );

    const view = await handler.execute();

    expect(view.sites).toEqual([
      {
        id: "fournil",
        label: "Site fournil",
        supply: "on_site",
        isDeparture: true,
        pickupColorB2b: "#fdd835",
        pickupColorB2c: null,
        deliveryColorB2b: "#1e88e5",
        deliveryColorB2c: "#8e24aa",
        resupplyColor: null,
        transferColor: null,
      },
      {
        id: "vv",
        label: "Val Village",
        supply: "transfer",
        isDeparture: false,
        pickupColorB2b: null,
        pickupColorB2c: "#9e9e9e",
        deliveryColorB2b: null,
        deliveryColorB2c: null,
        resupplyColor: "#26a69a",
        transferColor: null,
      },
    ]);
  });

  it("relit les sites à chaque appel : un changement de couleur se voit tout de suite", async () => {
    const sites = new FixedSites([FOURNIL]);
    const handler = new GetSitePaletteHandler(sites, new FixedDepartureSite(null));

    await handler.execute();
    const view = await handler.execute();

    expect(sites.lists).toBe(2);
    expect(view.sites[0]?.isDeparture).toBe(false);
  });
});

describe("DepartureDeliveryColors — les couleurs de livraison du départ (L5)", () => {
  it("les deux couleurs de livraison du site de départ, par clientèle", async () => {
    const colors = new DepartureDeliveryColors(
      new FixedSites([FOURNIL, VILLAGE]),
      new FixedDepartureSite("fournil"),
    );

    await expect(colors.colors()).resolves.toEqual({ pro: "#1e88e5", public: "#8e24aa" });
  });

  it("sans départ, ou départ inconnu : deux `null`, jamais une couleur devinée", async () => {
    const none = new DepartureDeliveryColors(
      new FixedSites([FOURNIL]),
      new FixedDepartureSite(null),
    );
    const ghost = new DepartureDeliveryColors(
      new FixedSites([FOURNIL]),
      new FixedDepartureSite("disparu"),
    );

    await expect(none.colors()).resolves.toEqual({ pro: null, public: null });
    await expect(ghost.colors()).resolves.toEqual({ pro: null, public: null });
  });

  it("les deux ports — livraison et retrait — rendent la même lecture", async () => {
    const colors = new DepartureDeliveryColors(
      new FixedSites([FOURNIL]),
      new FixedDepartureSite("fournil"),
    );

    const expected = { pro: "#1e88e5", public: "#8e24aa" };
    await expect(new SiteDeliveryColorsReader(colors).departureColors()).resolves.toEqual(expected);
    await expect(new SiteRunSheetColorsReader(colors).departureColors()).resolves.toEqual(expected);
  });
});
