/**
 * **Deux commerciaux en même temps** (`l-avenant-date.md`, § 8.3) :
 * l'avenant annonce le dernier avenant vu, et le handler refuse sous le verrou
 * si un autre a été écrit depuis.
 */
import { randomUUID } from "node:crypto";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import type { AmendCompanyMercurialePayload } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import { PricedCompanyReader } from "../../../domain/ports/priced-company.reader.js";
import { MercurialeAmendedMeanwhileError } from "../../../domain/pricing-errors.js";
import { InMemoryPolicyPromotionNames } from "../../../infrastructure/in-memory-policy-promotion-names.js";
import { InMemoryReservedElsewhere } from "../../../infrastructure/in-memory-reserved-elsewhere.js";
import { InMemorySaleReferences } from "../../../infrastructure/in-memory-sale-references.js";
import { InMemoryVolumeCommitments } from "../../../infrastructure/in-memory-volume-commitments.js";
import { AmendCompanyMercurialeCommand } from "../amend-company-mercuriale.command.js";
import { AmendCompanyMercurialeHandler } from "../amend-company-mercuriale.handler.js";
import {
  LockingMercuriales,
  TracingUnitOfWork,
  type Trace,
} from "./mercuriale-amendment.doubles.js";

const NOW = new Date("2026-03-01T00:00:00.000Z");
const DAY = 86_400_000;

class Companies extends PricedCompanyReader {
  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/** Posée, puis amendée une fois par un collègue (`amd_colleague`). */
function amendedByColleague(): CompanyMercuriale {
  return CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: "co_folie",
      label: "Mercuriale 2026",
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 173_270 }] }],
      validFrom: new Date(NOW.getTime() - 60 * DAY),
      validTo: null,
    },
    "staff|marie",
  ).amend(
    "amd_colleague",
    {
      lines: [{ sku: "PAI-001-1", tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
      endedSkus: [],
      validFrom: NOW,
      validTo: null,
      reason: "Ajout",
      origin: null,
    },
    "staff|marie",
    NOW,
  );
}

function setup() {
  const trace: Trace = [];
  const uow = new TracingUnitOfWork(trace);
  const mercuriales = new LockingMercuriales(trace, uow, amendedByColleague());
  const handler = new AmendCompanyMercurialeHandler(
    new Companies(),
    mercuriales,
    new InMemorySaleReferences(["VIE-012", "PAI-001-1"], []),
    new FixedIdGenerator("amd"),
    new FixedClock(NOW),
    uow,
    new InMemoryReservedElsewhere(),
    new InMemoryPolicyPromotionNames(),
    new InMemoryVolumeCommitments([]),
    inMemoryIntents(),
  );
  return { mercuriales, handler };
}

const body = (over: Partial<AmendCompanyMercurialePayload>): AmendCompanyMercurialePayload => ({
  validTo: null,
  reason: "Renégociation",
  lines: [],
  endedSkus: ["VIE-012"],
  ...over,
});

const run = (handler: AmendCompanyMercurialeHandler, payload: AmendCompanyMercurialePayload) =>
  handler.execute(
    new AmendCompanyMercurialeCommand("co_folie", "merc_1", payload, "staff|paul", randomUUID()),
  );

describe("AmendCompanyMercurialeHandler — un avenant écrit pendant la saisie", () => {
  it("refuse (409) quand l'écran n'a vu aucun avenant et qu'un collègue en a écrit un", async () => {
    const { mercuriales, handler } = setup();

    const refused = run(handler, body({ basedOnAmendmentId: null }));

    await expect(refused).rejects.toBeInstanceOf(MercurialeAmendedMeanwhileError);
    await expect(refused).rejects.toMatchObject({
      category: "business",
      message:
        "Un autre avenant a été enregistré pendant votre saisie. Rechargez : vos changements seront recalculés.",
    });
    expect(mercuriales.written).toHaveLength(0);
  });

  it("refuse quand l'écran annonce un avenant plus ancien que le dernier", async () => {
    const { handler } = setup();

    await expect(run(handler, body({ basedOnAmendmentId: "amd_older" }))).rejects.toBeInstanceOf(
      MercurialeAmendedMeanwhileError,
    );
  });

  it("enregistre quand l'écran a vu le dernier avenant", async () => {
    const { mercuriales, handler } = setup();

    await run(handler, body({ basedOnAmendmentId: "amd_colleague" }));

    expect(mercuriales.written).toHaveLength(1);
  });

  it("ne contrôle rien quand le champ est absent (le report, les autres appelants)", async () => {
    const { mercuriales, handler } = setup();

    await run(handler, body({}));

    expect(mercuriales.written).toHaveLength(1);
  });
});
