/**
 * **Corriger les dates d'une mercuriale** (`comprendre-une-mercuriale.md`, § 9) :
 * le mur `company_id` à la désignation, le verrou, les refus de la pose
 * rejoués sur la nouvelle période (C5), l'avenant passé entre-temps (C6),
 * l'acte au journal (C7) — et rien d'écrit quand un refus tombe.
 *
 * Les dates ne sont comparées qu'entre elles et au `NOW` de la `FixedClock` :
 * aucune ne rencontre l'horloge du mur.
 */
import type { CorrectMercurialeWindowPayload } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../../domain/ports/company-mercuriale.reader.js";
import { CompanyMercurialeRepository } from "../../../domain/ports/company-mercuriale.repository.js";
import { PricedDecisionsReader } from "../../../domain/ports/priced-decisions.reader.js";
import type { PricingAct } from "../../../domain/pricing-act.js";
import {
  GeneralDiscountOverVolumeCommitmentError,
  MercurialeAlreadyStartedError,
  MercurialeAmendedMeanwhileError,
  MissingWindowCorrectionReasonError,
  PosedMercurialeNotFoundError,
  PricedPeriodIsSealedError,
  RunningMercurialeError,
} from "../../../domain/pricing-errors.js";
import type { VolumeCommitment } from "../../../domain/volume-commitment.js";
import { InMemoryVolumeCommitments } from "../../../infrastructure/in-memory-volume-commitments.js";
import { CorrectMercurialeWindowCommand } from "../correct-mercuriale-window.command.js";
import { CorrectMercurialeWindowHandler } from "../correct-mercuriale-window.handler.js";
import { TracingUnitOfWork, type Trace } from "./mercuriale-amendment.doubles.js";

const NOW = new Date("2026-03-01T09:00:00.000Z");
const APRIL = "2026-03-31T22:00:00.000Z";
const JULY = "2026-06-30T22:00:00.000Z";
const NEXT_YEAR = new Date("2027-03-31T22:00:00.000Z");

const posed = (over: { companyId?: string; discount?: boolean } = {}): CompanyMercuriale =>
  CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: over.companyId ?? "co_folie",
      label: "Mercuriale 2026",
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 173_270 }] }],
      validFrom: NEXT_YEAR,
      validTo: null,
      generalDiscount:
        over.discount === true ? { mode: "all_except", baseBp: 3_000, rules: [] } : null,
    },
    "staff|marie",
  );

class Listed extends CompanyMercurialeReader {
  constructor(private readonly all: readonly CompanyMercuriale[]) {
    super();
  }
  listFor(companyId: string): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve(this.all.filter((entry) => entry.companyId === companyId));
  }
  liveFor(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  liveAsOf(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  liveEverywhere(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve([]);
  }
}

class Priced extends PricedDecisionsReader {
  constructor(private readonly ids: readonly string[]) {
    super();
  }
  hasPriced(decisionId: string): Promise<boolean> {
    return Promise.resolve(this.ids.includes(decisionId));
  }
}

/** Le verrou et l'écriture disent s'ils ont eu lieu dans l'unité de travail. */
class WindowMercuriales extends CompanyMercurialeRepository {
  readonly written: { mercuriale: CompanyMercuriale; act: PricingAct }[] = [];
  running: CompanyMercuriale | null = null;
  archived: readonly string[] = [];
  exceptId: string | undefined;
  constructor(
    private readonly trace: Trace,
    private readonly uow: TracingUnitOfWork,
    private readonly stored: CompanyMercuriale,
  ) {
    super();
  }
  lockForAmendment(): Promise<CompanyMercuriale | null> {
    this.trace.push(this.uow.open ? "lock (in tx)" : "lock (OUTSIDE tx)");
    return Promise.resolve(this.stored);
  }
  correctWindow(mercuriale: CompanyMercuriale, act: PricingAct): Promise<void> {
    this.trace.push(this.uow.open ? "write (in tx)" : "write (OUTSIDE tx)");
    this.written.push({ mercuriale, act });
    return Promise.resolve();
  }
  runningFor(
    _companyId: string,
    _from: Date,
    _to: Date | null,
    exceptId?: string,
  ): Promise<CompanyMercuriale | null> {
    this.exceptId = exceptId;
    return Promise.resolve(this.running);
  }
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve(this.archived);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
  rename(): Promise<void> {
    return Promise.resolve();
  }
  addAmendment(): Promise<void> {
    return Promise.resolve();
  }
  load(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
}

const commitment: VolumeCommitment = {
  id: "vc_1",
  companyId: "co_folie",
  scope: { type: "product", id: "VIE-012" },
  promisedQuantity: 1_000,
  validFrom: new Date("2026-05-01T00:00:00.000Z"),
  validTo: new Date("2026-06-01T00:00:00.000Z"),
};

function setup(
  stored: CompanyMercuriale = posed(),
  options: { commitments?: readonly VolumeCommitment[]; priced?: readonly string[] } = {},
) {
  const trace: Trace = [];
  const uow = new TracingUnitOfWork(trace);
  const mercuriales = new WindowMercuriales(trace, uow, stored);
  const handler = new CorrectMercurialeWindowHandler(
    new Listed([stored]),
    mercuriales,
    new Priced(options.priced ?? []),
    new InMemoryVolumeCommitments(options.commitments ?? []),
    new FixedClock(NOW),
    uow,
  );
  const run = (over: Partial<CorrectMercurialeWindowPayload> = {}, companyId = "co_folie") =>
    handler.execute(
      new CorrectMercurialeWindowCommand(
        companyId,
        "merc_1",
        {
          validFrom: APRIL,
          validTo: JULY,
          reason: "Posée en 2027 au lieu de 2026",
          basedOnAmendmentId: null,
          ...over,
        },
        "staff|paul",
      ),
    );
  return { trace, mercuriales, run };
}

describe("CorrectMercurialeWindowHandler", () => {
  it("verrouille, puis écrit les nouvelles dates dans la même transaction", async () => {
    const { trace, mercuriales, run } = setup();
    await run();

    expect(trace).toEqual(["begin", "lock (in tx)", "write (in tx)", "end"]);
    const state = mercuriales.written[0]?.mercuriale.toPersistence();
    expect(state?.validFrom).toEqual(new Date(APRIL));
    expect(state?.validTo).toEqual(new Date(JULY));
  });

  it("C7 : inscrit l'acte sur le document, avec le motif et les deux fenêtres en jours de Paris", async () => {
    const { mercuriales, run } = setup();
    await run({ reason: "  Posée en 2027 au lieu de 2026 " });

    expect(mercuriales.written[0]?.act).toMatchObject({
      subjectType: "mercuriale",
      subjectId: "merc_1",
      actor: "staff|paul",
      at: NOW,
      reason: "Posée en 2027 au lieu de 2026",
      summary:
        "Dates corrigées : du 1er avril 2027, sans date de fin → du 1er avril 2026 au 1er juillet 2026",
      subjectLabel: "Mercuriale 2026",
    });
  });

  it("C7 : refuse un motif blanc, sans rien verrouiller", async () => {
    const { trace, run } = setup();

    await expect(run({ reason: "  " })).rejects.toThrow(MissingWindowCorrectionReasonError);
    expect(trace).toEqual([]);
  });

  it("refuse la mercuriale d'un autre client : le mur company_id", async () => {
    const { mercuriales, run } = setup();

    await expect(run({}, "co_autre")).rejects.toThrow(PosedMercurialeNotFoundError);
    expect(mercuriales.written).toEqual([]);
  });

  it("C1 : refuse une mercuriale commencée, sans rien écrire", async () => {
    const started = CompanyMercuriale.reconstitute({
      ...posed().toPersistence(),
      validFrom: new Date("2026-02-01T00:00:00.000Z"),
    });
    const { mercuriales, run } = setup(started);

    await expect(run()).rejects.toThrow(MercurialeAlreadyStartedError);
    expect(mercuriales.written).toEqual([]);
  });

  it("C5 : refuse une mercuriale en cours sur la nouvelle période, et s'écarte elle-même", async () => {
    const { mercuriales, run } = setup();
    mercuriales.running = posed({ companyId: "co_folie" });

    await expect(run()).rejects.toThrow(RunningMercurialeError);
    expect(mercuriales.exceptId).toBe("merc_1");
    expect(mercuriales.written).toEqual([]);
  });

  it("C5 : refuse une période qu'une mercuriale close a facturée", async () => {
    const { mercuriales, run } = setup(posed(), { priced: ["merc_old"] });
    mercuriales.archived = ["merc_old"];

    await expect(run()).rejects.toThrow(PricedPeriodIsSealedError);
    expect(mercuriales.written).toEqual([]);
  });

  it("C5 : accepte une période qu'une mercuriale close n'a jamais facturée", async () => {
    const { mercuriales, run } = setup();
    mercuriales.archived = ["merc_old"];

    await run();
    expect(mercuriales.written).toHaveLength(1);
  });

  it("C5 : refuse une remise générale sur un engagement de volume de la nouvelle période", async () => {
    const { mercuriales, run } = setup(posed({ discount: true }), { commitments: [commitment] });

    await expect(run()).rejects.toThrow(GeneralDiscountOverVolumeCommitmentError);
    expect(mercuriales.written).toEqual([]);
  });

  it("C5 : laisse passer l'engagement de volume quand rien ne porte de remise générale", async () => {
    const { mercuriales, run } = setup(posed(), { commitments: [commitment] });

    await run();
    expect(mercuriales.written).toHaveLength(1);
  });

  it("C5 : refuse la remise générale d'un avenant sur un engagement de volume", async () => {
    const amended = posed().amend(
      "amd_1",
      {
        lines: [],
        endedSkus: [],
        validFrom: NEXT_YEAR,
        validTo: null,
        reason: "Remise",
        origin: null,
        generalDiscount: { set: { mode: "all_except", baseBp: 2_000, rules: [] } },
      },
      "staff|marie",
      NOW,
    );
    // L'engagement court sous la remise de l'avenant (2027), pas sous la
    // nouvelle période du document seule.
    const underAmendment: VolumeCommitment = {
      ...commitment,
      validFrom: new Date("2027-05-01T00:00:00.000Z"),
      validTo: new Date("2027-06-01T00:00:00.000Z"),
    };
    const { mercuriales, run } = setup(amended, { commitments: [underAmendment] });

    await expect(
      run({ validTo: null, basedOnAmendmentId: "amd_1", validFrom: APRIL }),
    ).rejects.toThrow(GeneralDiscountOverVolumeCommitmentError);
    expect(mercuriales.written).toEqual([]);
  });

  it("C6 : refuse quand un avenant a été écrit depuis celui que l'écran a vu", async () => {
    const amended = posed().amend(
      "amd_colleague",
      {
        lines: [{ sku: "PAI-001", tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
        endedSkus: [],
        validFrom: NEXT_YEAR,
        validTo: null,
        reason: "Ajout",
        origin: null,
      },
      "staff|marie",
      NOW,
    );
    const { mercuriales, run } = setup(amended);

    await expect(run({ validTo: null, basedOnAmendmentId: null })).rejects.toThrow(
      MercurialeAmendedMeanwhileError,
    );
    expect(mercuriales.written).toEqual([]);
  });

  it("C6 : accepte quand l'écran annonce le dernier avenant", async () => {
    const amended = posed().amend(
      "amd_colleague",
      {
        lines: [{ sku: "PAI-001", tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
        endedSkus: [],
        validFrom: NEXT_YEAR,
        validTo: null,
        reason: "Ajout",
        origin: null,
      },
      "staff|marie",
      NOW,
    );
    const { mercuriales, run } = setup(amended);

    await run({ validTo: null, basedOnAmendmentId: "amd_colleague" });
    expect(mercuriales.written).toHaveLength(1);
  });
});
