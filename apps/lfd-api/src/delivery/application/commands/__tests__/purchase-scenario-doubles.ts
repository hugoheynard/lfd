import type {
  BinTypeView,
  PurchaseBinCandidateView,
  PurchaseScenarioContent,
  PurchaseScenarioSummaryView,
  PurchaseVehicleCandidateView,
} from "@lfd/contracts";

import {
  PurchaseScenario,
  type PurchaseScenarioStoredContent,
} from "../../../domain/entities/purchase-scenario.js";
import { PurchaseBinCandidatesReader } from "../../../domain/ports/purchase-bin-candidates.reader.js";
import { PurchaseScenarioRepository } from "../../../domain/ports/purchase-scenario.repository.js";
import {
  type PurchaseScenarioRecord,
  PurchaseScenariosReader,
} from "../../../domain/ports/purchase-scenarios.reader.js";
import { PurchaseVehicleCandidatesReader } from "../../../domain/ports/purchase-vehicle-candidates.reader.js";

/**
 * Les scénarios d'achat en mémoire, stockés par leur état comme en base.
 * `reader` lit la même source que l'écriture — ce que fait l'adaptateur Prisma.
 */
export class InMemoryPurchaseScenarios extends PurchaseScenarioRepository {
  readonly reader: PurchaseScenariosReader;
  private readonly byId = new Map<string, PurchaseScenario>();

  constructor(...scenarios: readonly PurchaseScenario[]) {
    super();
    for (const scenario of scenarios) {
      this.byId.set(scenario.id, PurchaseScenario.restore(scenario.toState()));
    }
    const all = (): PurchaseScenario[] => [...this.byId.values()];
    this.reader = new (class extends PurchaseScenariosReader {
      list(includeArchived: boolean): Promise<readonly PurchaseScenarioSummaryView[]> {
        return Promise.resolve(
          all()
            .filter((s) => includeArchived || !s.archived)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(summaryOf),
        );
      }

      byId(id: string): Promise<PurchaseScenarioRecord | null> {
        const found = all().find((scenario) => scenario.id === id);
        if (found === undefined) {
          return Promise.resolve(null);
        }
        const state = found.toState();
        return Promise.resolve({
          id: state.id,
          name: state.name,
          stored: state.stored,
          updatedAt: state.updatedAt,
          archivedAt: state.archivedAt,
        });
      }
    })();
  }

  load(id: string): Promise<PurchaseScenario | null> {
    const found = this.byId.get(id);
    return Promise.resolve(found === undefined ? null : PurchaseScenario.restore(found.toState()));
  }

  save(scenario: PurchaseScenario): Promise<void> {
    this.byId.set(scenario.id, PurchaseScenario.restore(scenario.toState()));
    return Promise.resolve();
  }

  activeNameTaken(name: string, exceptId: string): Promise<boolean> {
    return Promise.resolve(
      [...this.byId.values()].some((s) => !s.archived && s.name === name && s.id !== exceptId),
    );
  }
}

function summaryOf(scenario: PurchaseScenario): PurchaseScenarioSummaryView {
  const { stored, updatedAt, updatedBy, archivedAt } = scenario.toState();
  return {
    id: scenario.id,
    name: scenario.name,
    vehicles: stored.readable ? stored.content.selection.vehicles.length : 0,
    formats: stored.readable ? stored.content.selection.formats.length : 0,
    updatedAt: updatedAt.toISOString(),
    updatedBy: updatedBy.name === "" ? null : updatedBy.name,
    archivedAt: archivedAt?.toISOString() ?? null,
  };
}

export const PURCHASE_CONTENT: PurchaseScenarioContent = {
  selection: {
    vehicles: [
      { source: "candidate", id: "vc1" },
      { source: "fleet", id: "v1" },
    ],
    formats: [{ source: "candidate", id: "bc1" }],
    gapCm: 1,
  },
  display: { criterion: "occupation", showCostPerLiter: false },
};

/** Un scénario enregistré, lisible ou non, archivé ou non. */
export function purchaseScenarioNamed(
  id: string,
  name: string,
  options: {
    readonly stored?: PurchaseScenarioStoredContent;
    readonly archivedAt?: Date | null;
  } = {},
): PurchaseScenario {
  const recorded = PurchaseScenario.record({
    id,
    name,
    content: PURCHASE_CONTENT,
    at: new Date(0),
    author: { staffUserId: "staff_1", name: "Hugo H", role: "admin" },
  });
  const state = recorded.toState();
  return PurchaseScenario.restore({
    ...state,
    stored: options.stored ?? state.stored,
    archivedAt: options.archivedAt ?? null,
  });
}

/** Les véhicules candidats, figés — archivés compris, comme `list(true)`. */
export class FixedVehicleCandidates extends PurchaseVehicleCandidatesReader {
  constructor(private readonly candidates: readonly PurchaseVehicleCandidateView[]) {
    super();
  }

  list(includeArchived: boolean): Promise<readonly PurchaseVehicleCandidateView[]> {
    return Promise.resolve(this.candidates.filter((c) => includeArchived || c.archivedAt === null));
  }
}

/** Les formats candidats, figés — archivés compris, comme `list(true)`. */
export class FixedBinCandidates extends PurchaseBinCandidatesReader {
  constructor(private readonly candidates: readonly PurchaseBinCandidateView[]) {
    super();
  }

  list(includeArchived: boolean): Promise<readonly PurchaseBinCandidateView[]> {
    return Promise.resolve(this.candidates.filter((c) => includeArchived || c.archivedAt === null));
  }
}

const EPOCH = new Date(0).toISOString();
const COMMON = {
  reference: null,
  purchaseUrl: null,
  createdAt: EPOCH,
  updatedAt: EPOCH,
  updatedBy: { staffUserId: "s1", name: "", role: "" },
};

export const vehicleCandidateView = (
  id: string,
  name: string,
  archivedAt: string | null = null,
): PurchaseVehicleCandidateView => ({
  ...COMMON,
  id,
  name,
  archivedAt,
  cargo: { lengthCm: 100, widthCm: 100, heightCm: 50, volumeLiters: 500 },
  wheelArches: null,
  priceCentsExclVat: null,
});

const FORMAT = {
  outer: { lengthCm: 60, widthCm: 40, heightCm: 20 },
  inner: { lengthCm: 50, widthCm: 30, heightCm: 20 },
  innerVolumeLiters: 30,
  isotherm: false,
  maxStack: 5,
};

export const binCandidateView = (
  id: string,
  name: string,
  archivedAt: string | null = null,
): PurchaseBinCandidateView => ({
  ...COMMON,
  ...FORMAT,
  id,
  name,
  archivedAt,
  supplier: null,
  unitPriceCentsExclVat: null,
});

/** Le même format, en type de bac : au millimètre. */
const TYPE_FORMAT = {
  ...FORMAT,
  outer: { lengthMm: 600, widthMm: 400, heightMm: 200 },
  inner: { lengthMm: 500, widthMm: 300, heightMm: 200 },
};

export const binTypeView = (
  id: string,
  name: string,
  archivedAt: string | null = null,
): BinTypeView => ({
  ...TYPE_FORMAT,
  id,
  name,
  divisible: false,
  archivedAt,
});
