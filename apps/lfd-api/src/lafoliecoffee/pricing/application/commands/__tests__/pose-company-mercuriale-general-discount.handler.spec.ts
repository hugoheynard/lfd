/**
 * **Poser une mercuriale à remise générale** (`plan-remise-generale.md`, R2) :
 * la remise passe du contrat au domaine, le journal la dit, et Q2 refuse la
 * remise chez un client qu'un engagement de volume couvre sur la période.
 *
 * Ports doublés par de vraies sous-classes. Les dates ne sont comparées qu'à
 * la fixture : le handler de pose ne lit pas l'horloge.
 */
import type { PoseCompanyMercurialePayload } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import type { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeRepository } from "../../../domain/ports/company-mercuriale.repository.js";
import { PricedCompanyReader } from "../../../domain/ports/priced-company.reader.js";
import { PricedDecisionsReader } from "../../../domain/ports/priced-decisions.reader.js";
import type { PricingAct } from "../../../domain/pricing-act.js";
import {
  EmptyMercurialeError,
  GeneralDiscountBaseRateError,
  GeneralDiscountOverVolumeCommitmentError,
} from "../../../domain/pricing-errors.js";
import type { VolumeCommitment } from "../../../domain/volume-commitment.js";
import { InMemoryPolicyPromotionNames } from "../../../infrastructure/in-memory-policy-promotion-names.js";
import { InMemoryReservedElsewhere } from "../../../infrastructure/in-memory-reserved-elsewhere.js";
import { InMemorySaleReferences } from "../../../infrastructure/in-memory-sale-references.js";
import { InMemoryVolumeCommitments } from "../../../infrastructure/in-memory-volume-commitments.js";
import {
  MercurialeDraftStore,
  type StoredMercurialeDraft,
} from "../../ports/mercuriale-draft.store.js";
import { PoseCompanyMercurialeCommand } from "../pose-company-mercuriale.command.js";
import { PoseCompanyMercurialeHandler } from "../pose-company-mercuriale.handler.js";

const FROM = "2026-06-01T00:00:00.000Z";
const TO = "2026-07-01T00:00:00.000Z";
const REFERENCES = new InMemorySaleReferences(["VIE-001", "PAI-001-1"], []);

class KnownCompanies extends PricedCompanyReader {
  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class NothingPriced extends PricedDecisionsReader {
  hasPriced(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

class RecordingMercuriales extends CompanyMercurialeRepository {
  readonly saved: { readonly mercuriale: CompanyMercuriale; readonly act: PricingAct }[] = [];
  save(mercuriale: CompanyMercuriale, act: PricingAct): Promise<void> {
    this.saved.push({ mercuriale, act });
    return Promise.resolve();
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
  rename(): Promise<void> {
    return Promise.resolve();
  }
  load(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  runningFor(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  lockForAmendment(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  addAmendment(): Promise<void> {
    return Promise.resolve();
  }
}

class NoDrafts extends MercurialeDraftStore {
  forCompany(): Promise<StoredMercurialeDraft | null> {
    return Promise.resolve(null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  discard(): Promise<void> {
    return Promise.resolve();
  }
}

const commitment = (validFrom: string, validTo: string): VolumeCommitment => ({
  id: "vc_1",
  companyId: "co_1",
  scope: { type: "product", id: "VIE-001" },
  promisedQuantity: 1_000,
  validFrom: new Date(validFrom),
  validTo: new Date(validTo),
});

function setup(commitments: readonly VolumeCommitment[] = []) {
  const mercuriales = new RecordingMercuriales();
  const handler = new PoseCompanyMercurialeHandler(
    new KnownCompanies(),
    mercuriales,
    new FixedIdGenerator("mer"),
    new NoDrafts(),
    new NothingPriced(),
    REFERENCES,
    new InMemoryReservedElsewhere(),
    new InMemoryPolicyPromotionNames(),
    new InMemoryVolumeCommitments(commitments),
  );
  const run = (over: Partial<PoseCompanyMercurialePayload> = {}) =>
    handler.execute(
      new PoseCompanyMercurialeCommand(
        "co_1",
        {
          label: "Mercuriale 2026",
          validFrom: FROM,
          validTo: TO,
          lines: [],
          generalDiscount: {
            mode: "all_except",
            baseBp: 3_000,
            rules: [
              { target: "category", targetId: "cat_pains", bp: 4_000 },
              { target: "variant", targetId: "VIE-001", bp: null },
            ],
          },
          ...over,
        },
        "staff_1",
      ),
    );
  return { mercuriales, run };
}

describe("PoseCompanyMercurialeHandler — remise générale", () => {
  it("pose une mercuriale à remise seule, sans prix ferme (D5)", async () => {
    const { mercuriales, run } = setup();

    const posed = await run();

    expect(posed).toBe(0);
    const [saved] = mercuriales.saved;
    expect(saved?.mercuriale.generalDiscount).toEqual({
      mode: "all_except",
      baseBp: 3_000,
      rules: [
        { target: "category", targetId: "cat_pains", bp: 4_000 },
        { target: "variant", targetId: "VIE-001", bp: null },
      ],
    });
    expect(saved?.mercuriale.lines).toEqual([]);
  });

  it("le journal dit la remise, ses taux particuliers et ses exclusions", async () => {
    const { mercuriales, run } = setup();

    await run();

    expect(mercuriales.saved[0]?.act.summary).toContain(
      "remise générale −30 %, 1 taux particulier, sauf 1 article",
    );
  });

  it("une mercuriale sans remise garde la phrase d'avant", async () => {
    const { mercuriales, run } = setup();

    await run({ generalDiscount: null, lines: [{ sku: "VIE-001", unitPriceMillicents: 90_000 }] });

    expect(mercuriales.saved[0]?.act.summary).not.toContain("remise générale");
  });

  it("refuse une mercuriale qui ne porte ni prix ferme ni remise", async () => {
    const { mercuriales, run } = setup();

    await expect(run({ generalDiscount: null })).rejects.toBeInstanceOf(EmptyMercurialeError);
    expect(mercuriales.saved).toEqual([]);
  });

  it("le domaine refuse une remise « tout sauf » sans taux de base", async () => {
    const { run } = setup();

    await expect(
      run({ generalDiscount: { mode: "all_except", baseBp: null, rules: [] } }),
    ).rejects.toBeInstanceOf(GeneralDiscountBaseRateError);
  });

  it("🔴 Q2 : refuse une remise chez un client dont un engagement recouvre la période", async () => {
    const { mercuriales, run } = setup([
      commitment("2026-06-15T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
    ]);

    const refusal = run();

    await expect(refusal).rejects.toBeInstanceOf(GeneralDiscountOverVolumeCommitmentError);
    await expect(refusal).rejects.toThrow(/Clôturez d'abord l'engagement/);
    expect(mercuriales.saved).toEqual([]);
  });

  it("Q2 : un engagement terminé avant la période ne bloque rien (borne haute exclue)", async () => {
    const { mercuriales, run } = setup([commitment("2026-01-01T00:00:00.000Z", FROM)]);

    await run();

    expect(mercuriales.saved).toHaveLength(1);
  });

  it("Q2 : sans remise, l'engagement ne bloque pas la pose de prix fermes", async () => {
    const { mercuriales, run } = setup([
      commitment("2026-06-15T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
    ]);

    await run({ generalDiscount: null, lines: [{ sku: "VIE-001", unitPriceMillicents: 90_000 }] });

    expect(mercuriales.saved).toHaveLength(1);
  });

  it("Q2 : une mercuriale sans fin est recouverte par tout engagement qui finit après son début", async () => {
    const { run } = setup([commitment("2027-01-01T00:00:00.000Z", "2027-06-01T00:00:00.000Z")]);

    await expect(run({ validTo: null })).rejects.toBeInstanceOf(
      GeneralDiscountOverVolumeCommitmentError,
    );
  });
});
