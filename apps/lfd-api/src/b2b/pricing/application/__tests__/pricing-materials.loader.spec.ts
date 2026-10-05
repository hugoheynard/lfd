import { millicentsFromCents } from "@lfd/money";

import { catalogueArticle } from "../../../catalog/domain/catalogue-article.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import type { PricingParties } from "../../domain/loaded-pricer.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { CustomerVolumeReader } from "../../domain/ports/customer-volume.reader.js";
import { PriceFloorReader } from "../../domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "../../domain/ports/price-rule.reader.js";
import { SkuVolumeReader } from "../../domain/ports/sku-volume.reader.js";
import { VolumeCommitmentReader } from "../../domain/ports/volume-commitment.reader.js";
import { VolumeLadderReader } from "../../domain/ports/volume-ladder.reader.js";
import type { PriceEpoch } from "../../domain/price-epoch.js";
import type { PriceRule, ScopedPriceFloor } from "../../domain/price-rule.js";
import type { VolumeCommitment } from "../../domain/volume-commitment.js";
import type { VolumeLadder } from "../../domain/volume-ladder.js";
import { PricingMaterialsLoader } from "../pricing-materials.loader.js";

/**
 * **Le chargeur à deux clés** (`plan-sous-comptes.md`, §2.2) : les règles
 * d'audience `company` sur la société servie, la mercuriale et les engagements
 * sur le compte de tarif.
 *
 * Dates absolues comparées entre elles seulement : le chargeur n'a pas
 * d'horloge (exception écrite au §5 de `CLAUDE.md`).
 */
const AT = new Date("2026-06-15T09:00:00.000Z");
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");
const CROISSANT = catalogueArticle({
  sku: "CRO-001",
  name: "Croissant",
  categoryPath: ["fam-vien"],
  unitPriceMillicents: millicentsFromCents(100),
});

const SITE: PricingParties = { companyId: "co_site", pricingCompanyId: "co_group" };

class AskedMercuriales extends CompanyMercurialeReader {
  readonly asked: { readonly epoch: PriceEpoch; readonly companyId: string | null }[] = [];

  constructor(private readonly posed: readonly CompanyMercuriale[]) {
    super();
  }
  liveFor(companyId: string | null): Promise<CompanyMercuriale | null> {
    this.asked.push({ epoch: "current", companyId });
    return Promise.resolve(this.find(companyId));
  }
  liveAsOf(companyId: string | null): Promise<CompanyMercuriale | null> {
    this.asked.push({ epoch: "replay", companyId });
    return Promise.resolve(this.find(companyId));
  }
  listFor(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve(this.posed);
  }
  liveEverywhere(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve(this.posed);
  }
  private find(companyId: string | null): CompanyMercuriale | null {
    return this.posed.find((mercuriale) => mercuriale.companyId === companyId) ?? null;
  }
}

class AskedCommitments extends VolumeCommitmentReader {
  readonly asked: (string | null)[] = [];

  constructor(private readonly commitments: readonly VolumeCommitment[] = []) {
    super();
  }
  liveFor(companyId: string | null): Promise<readonly VolumeCommitment[]> {
    this.asked.push(companyId);
    return Promise.resolve(this.commitments.filter((entry) => entry.companyId === companyId));
  }
  liveAsOf(companyId: string | null): Promise<readonly VolumeCommitment[]> {
    return this.liveFor(companyId);
  }
}

class AskedVolumes extends CustomerVolumeReader {
  readonly asked: string[] = [];
  readonly ownAsked: string[] = [];

  volumesFor(companyId: string): Promise<ReadonlyMap<string, number>> {
    this.ownAsked.push(companyId);
    return Promise.resolve(new Map());
  }
  committedVolumesFor(companyId: string): Promise<ReadonlyMap<string, number>> {
    this.asked.push(companyId);
    return Promise.resolve(new Map());
  }
}

class FixedRules extends PriceRuleReader {
  constructor(private readonly rules: readonly PriceRule[]) {
    super();
  }
  inScopes(): Promise<PriceRule[]> {
    return Promise.resolve([...this.rules]);
  }
  listAll(): Promise<PriceRule[]> {
    return Promise.resolve([...this.rules]);
  }
  listArchived(): Promise<PriceRule[]> {
    return Promise.resolve([]);
  }
}

class NoFloors extends PriceFloorReader {
  inScopes(): Promise<ScopedPriceFloor[]> {
    return Promise.resolve([]);
  }
  listAll(): Promise<ScopedPriceFloor[]> {
    return Promise.resolve([]);
  }
}

class NoLadders extends VolumeLadderReader {
  inScopes(): Promise<VolumeLadder[]> {
    return Promise.resolve([]);
  }
  listAll(): Promise<VolumeLadder[]> {
    return Promise.resolve([]);
  }
}

class NoSkuVolumes extends SkuVolumeReader {
  volumesFor(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map());
  }
}

function mercuriale(companyId: string, cents: number): CompanyMercuriale {
  return CompanyMercuriale.pose(
    `merc_${companyId}`,
    {
      companyId,
      label: "Mercuriale 2026",
      lines: [
        {
          sku: "CRO-001",
          tiers: [{ minQuantity: 1, unitPriceMillicents: millicentsFromCents(cents) }],
        },
      ],
      validFrom: LONG_AGO,
      validTo: null,
    },
    "staff_test",
  );
}

/** Un geste de −10 centimes réservé nommément à une société. */
function gestureFor(companyId: string): PriceRule {
  return {
    id: `geste_${companyId}`,
    stage: "geste",
    scope: { type: "global", id: null },
    audience: { type: "company", id: companyId },
    minQuantity: null,
    validFrom: LONG_AGO,
    validTo: null,
    suspendedFrom: null,
    label: "Geste",
    stacksOverMercuriale: true,
    nature: "alter",
    alteration: { direction: "decrease", mode: "amount", millicents: millicentsFromCents(10) },
  };
}

const GROUP_COMMITMENT: VolumeCommitment = {
  id: "cmt_group",
  companyId: "co_group",
  scope: { type: "global", id: null },
  promisedQuantity: 1_000,
  validFrom: LONG_AGO,
  validTo: new Date("2026-12-31T00:00:00.000Z"),
};

function loaderWith(parts: {
  mercuriales?: readonly CompanyMercuriale[];
  rules?: readonly PriceRule[];
  commitments?: readonly VolumeCommitment[];
}) {
  const mercuriales = new AskedMercuriales(parts.mercuriales ?? []);
  const commitments = new AskedCommitments(parts.commitments ?? []);
  const volumes = new AskedVolumes();
  const loader = new PricingMaterialsLoader(
    new FixedRules(parts.rules ?? []),
    mercuriales,
    new NoFloors(),
    new NoSkuVolumes(),
    new NoLadders(),
    commitments,
    volumes,
  );
  return { loader, mercuriales, commitments, volumes };
}

async function priceOf(
  loader: PricingMaterialsLoader,
  parties: PricingParties,
  epoch: PriceEpoch = "current",
): Promise<number> {
  const pricer = await loader.pricerFor(
    [{ item: CROISSANT, quantity: 1 }],
    parties,
    AT,
    "measured",
    epoch,
  );
  if (pricer === null) {
    throw new Error("Le lot d'un article ne peut pas être vide.");
  }
  return pricer.price(CROISSANT, 1).finalMillicents;
}

describe("PricingMaterialsLoader — deux clés", () => {
  it("applique la mercuriale du compte de tarif au sous-compte qui le suit", async () => {
    const { loader, mercuriales } = loaderWith({
      mercuriales: [mercuriale("co_group", 80), mercuriale("co_site", 90)],
    });

    expect(await priceOf(loader, SITE)).toBe(millicentsFromCents(80));
    expect(mercuriales.asked).toEqual([{ epoch: "current", companyId: "co_group" }]);
  });

  it("lit la mercuriale du compte de tarif aussi en relecture", async () => {
    const { loader, mercuriales } = loaderWith({ mercuriales: [mercuriale("co_group", 80)] });

    expect(await priceOf(loader, SITE, "replay")).toBe(millicentsFromCents(80));
    expect(mercuriales.asked).toEqual([{ epoch: "replay", companyId: "co_group" }]);
  });

  it("garde les règles d'audience `company` sur la société servie", async () => {
    const { loader } = loaderWith({
      rules: [gestureFor("co_site"), gestureFor("co_group")],
    });

    // Seul le geste du sous-compte : celui du principal ne le vise pas.
    expect(await priceOf(loader, SITE)).toBe(millicentsFromCents(90));
  });

  it("lit les engagements sur le compte de tarif, et mesure le principal", async () => {
    const { loader, commitments, volumes } = loaderWith({ commitments: [GROUP_COMMITMENT] });

    await priceOf(loader, SITE);

    expect(commitments.asked).toEqual(["co_group"]);
    // Le volume de l'ENGAGEMENT, sous-comptes compris (Q6) — jamais la société seule.
    expect(volumes.asked).toEqual(["co_group"]);
    expect(volumes.ownAsked).toEqual([]);
  });

  it("sans suivi, le sous-compte paie sa propre mercuriale", async () => {
    const { loader } = loaderWith({
      mercuriales: [mercuriale("co_group", 80), mercuriale("co_site", 90)],
    });

    expect(await priceOf(loader, { companyId: "co_site", pricingCompanyId: "co_site" })).toBe(
      millicentsFromCents(90),
    );
  });
});
