/**
 * **Les trois écritures d'une mercuriale, une fois par intention** : la pose
 * (sujet : la société), l'avenant et la correction de dates (sujet : la
 * mercuriale). Un double envoi de même clé rend la réponse d'origine sans
 * réécrire ; en vol ou sur un autre sujet, 409 ; un refus rend la clé.
 *
 * Les dates ne sont comparées qu'au `NOW` de la `FixedClock`.
 */
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { intentSubject } from "../../../../../platform/intent/intent-subject.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../../domain/ports/company-mercuriale.reader.js";
import { PricedCompanyReader } from "../../../domain/ports/priced-company.reader.js";
import { PricedDecisionsReader } from "../../../domain/ports/priced-decisions.reader.js";
import { InMemoryPolicyPromotionNames } from "../../../infrastructure/in-memory-policy-promotion-names.js";
import { InMemoryReservedElsewhere } from "../../../infrastructure/in-memory-reserved-elsewhere.js";
import { InMemorySaleReferences } from "../../../infrastructure/in-memory-sale-references.js";
import { InMemoryVolumeCommitments } from "../../../infrastructure/in-memory-volume-commitments.js";
import {
  MercurialeDraftStore,
  type StoredMercurialeDraft,
} from "../../ports/mercuriale-draft.store.js";
import { AmendCompanyMercurialeCommand } from "../amend-company-mercuriale.command.js";
import { AmendCompanyMercurialeHandler } from "../amend-company-mercuriale.handler.js";
import { CorrectMercurialeWindowCommand } from "../correct-mercuriale-window.command.js";
import { CorrectMercurialeWindowHandler } from "../correct-mercuriale-window.handler.js";
import { MERCURIALE_GESTURES } from "../mercuriale-intent-support.js";
import { PoseCompanyMercurialeCommand } from "../pose-company-mercuriale.command.js";
import { PoseCompanyMercurialeHandler } from "../pose-company-mercuriale.handler.js";
import {
  LockingMercuriales,
  TracingUnitOfWork,
  type Trace,
} from "./mercuriale-amendment.doubles.js";
import { KEY, type IntentProbe, TracingIntentLedger } from "./mercuriale-intent.contract.js";
import {
  GestureInFlightError,
  IntentKeyReusedError,
} from "../../../../../platform/intent/intent-errors.js";

const NOW = new Date("2026-03-01T09:00:00.000Z");
const NEXT_YEAR = new Date("2027-03-31T22:00:00.000Z");
const STAFF = "staff|paul";
const REFERENCES = new InMemorySaleReferences(["VIE-012", "PAI-001-1"], []);

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

/** Une mercuriale à venir chez `co_folie` : amendable, et ses dates corrigeables. */
const upcoming = (): CompanyMercuriale =>
  CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: "co_folie",
      label: "Mercuriale 2027",
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 173_270 }] }],
      validFrom: NEXT_YEAR,
      validTo: null,
      generalDiscount: null,
    },
    "staff|marie",
  );

/** Les quatre issues d'une intention, plus la résolution dans la transaction. */
function describeOncePerIntent(gesture: string, setup: () => IntentProbe): void {
  describe(`${gesture} — une fois par intention`, () => {
    it("rejouée avec la même clé : rend la réponse d'origine sans rien réécrire", async () => {
      const probe = setup();
      const first = await probe.run(KEY);

      await expect(probe.run(KEY)).resolves.toEqual(first);
      expect(probe.writes()).toBe(1);
    });

    it("🔴 la clé est résolue DANS la transaction de l'écriture", async () => {
      const probe = setup();
      await probe.run(KEY);

      expect(probe.ledger.resolutions).toEqual(["in tx"]);
    });

    it("même clé encore en vol : 409, rien n'est écrit", async () => {
      const probe = setup();
      await probe.ledger.claim(probe.intent, probe.now);

      await expect(probe.run(KEY)).rejects.toBeInstanceOf(GestureInFlightError);
      expect(probe.writes()).toBe(0);
    });

    it("même clé sur un autre sujet : 409, rien n'est écrit", async () => {
      const probe = setup();
      await probe.run(KEY);

      await expect(probe.run(KEY, true)).rejects.toBeInstanceOf(IntentKeyReusedError);
      expect(probe.writes()).toBe(1);
    });

    it("même clé sur un autre geste : 409", async () => {
      const probe = setup();
      await probe.ledger.claim({ ...probe.intent, gesture: "pricing.other" }, probe.now);

      await expect(probe.run(KEY)).rejects.toBeInstanceOf(IntentKeyReusedError);
      expect(probe.writes()).toBe(0);
    });

    it("un refus rend l'intention : la même clé réessaie et aboutit", async () => {
      const probe = setup();
      await expect(probe.runRefused(KEY)).rejects.toThrow();
      expect(probe.writes()).toBe(0);

      await probe.run(KEY);
      expect(probe.writes()).toBe(1);
    });
  });
}

function harness() {
  const trace: Trace = [];
  const uow = new TracingUnitOfWork(trace);
  const ledger = new TracingIntentLedger(uow);
  const intents = new OncePerIntent(ledger, new FixedClock(NOW));
  const mercuriales = new LockingMercuriales(trace, uow, upcoming());
  return { uow, ledger, intents, mercuriales };
}

describeOncePerIntent("la pose", (): IntentProbe => {
  const { uow, ledger, intents, mercuriales } = harness();
  const handler = new PoseCompanyMercurialeHandler(
    new KnownCompanies(),
    mercuriales,
    new FixedIdGenerator("mer"),
    new NoDrafts(),
    new NothingPriced(),
    REFERENCES,
    new InMemoryReservedElsewhere(),
    new InMemoryPolicyPromotionNames(),
    new InMemoryVolumeCommitments(),
    uow,
    intents,
  );
  const terms = (sku: string) => ({
    label: "Été",
    validFrom: NEXT_YEAR.toISOString(),
    validTo: null,
    lines: [{ sku, unitPriceMillicents: 180_000 }],
  });
  const pose = (key: string, companyId: string, sku: string) =>
    handler.execute(new PoseCompanyMercurialeCommand(companyId, terms(sku), STAFF, key));
  return {
    ledger,
    now: NOW,
    intent: {
      actorId: STAFF,
      key: KEY,
      gesture: MERCURIALE_GESTURES.pose,
      subject: intentSubject("co_folie", terms("VIE-012")),
    },
    run: (key, other = false) => pose(key, other ? "co_other" : "co_folie", "VIE-012"),
    runRefused: (key) => pose(key, "co_folie", "HORS-VENTE"),
    writes: () => mercuriales.saved.length,
  };
});

describeOncePerIntent("l'avenant", (): IntentProbe => {
  const { uow, ledger, intents, mercuriales } = harness();
  const handler = new AmendCompanyMercurialeHandler(
    new KnownCompanies(),
    mercuriales,
    REFERENCES,
    new FixedIdGenerator("amd"),
    new FixedClock(NOW),
    uow,
    new InMemoryReservedElsewhere(),
    new InMemoryPolicyPromotionNames(),
    new InMemoryVolumeCommitments(),
    intents,
  );
  const amendment = (sku: string) => ({
    validFrom: NEXT_YEAR.toISOString(),
    validTo: null,
    reason: "Référence ajoutée",
    lines: [{ sku, unitPriceMillicents: 150_000 }],
    endedSkus: [],
  });
  const amend = (key: string, mercurialeId: string, sku: string) =>
    handler.execute(
      new AmendCompanyMercurialeCommand("co_folie", mercurialeId, amendment(sku), STAFF, key),
    );
  return {
    ledger,
    now: NOW,
    intent: {
      actorId: STAFF,
      key: KEY,
      gesture: MERCURIALE_GESTURES.amend,
      subject: intentSubject("merc_1", "co_folie", amendment("PAI-001-1")),
    },
    run: (key, other = false) => amend(key, other ? "merc_2" : "merc_1", "PAI-001-1"),
    runRefused: (key) => amend(key, "merc_1", "HORS-VENTE"),
    writes: () => mercuriales.written.length,
  };
});

describeOncePerIntent("la correction de dates", (): IntentProbe => {
  const { uow, ledger, intents, mercuriales } = harness();
  const handler = new CorrectMercurialeWindowHandler(
    new Listed([upcoming()]),
    mercuriales,
    new NothingPriced(),
    new InMemoryVolumeCommitments(),
    new FixedClock(NOW),
    uow,
    intents,
  );
  const window = (reason: string) => ({
    validFrom: "2026-03-31T22:00:00.000Z",
    validTo: "2026-06-30T22:00:00.000Z",
    reason,
    basedOnAmendmentId: null,
  });
  const correct = (key: string, mercurialeId: string, reason: string) =>
    handler.execute(
      new CorrectMercurialeWindowCommand("co_folie", mercurialeId, window(reason), STAFF, key),
    );
  return {
    ledger,
    now: NOW,
    intent: {
      actorId: STAFF,
      key: KEY,
      gesture: MERCURIALE_GESTURES.correctWindow,
      subject: intentSubject("merc_1", "co_folie", window("Posée en 2027")),
    },
    run: (key, other = false) => correct(key, other ? "merc_2" : "merc_1", "Posée en 2027"),
    runRefused: (key) => correct(key, "merc_1", "  "),
    writes: () => mercuriales.corrected.length,
  };
});
