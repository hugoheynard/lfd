import type { LegalEntityView } from "@lfd/contracts";

import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  IssuedMandatesReader,
  type IssuedMandatesUsage,
} from "../../../domain/ports/issued-mandates.reader.js";
import { LegalEntityReader } from "../../../domain/ports/legal-entity.reader.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import { GetMandateSchemeUsageHandler } from "../get-mandate-scheme-usage.handler.js";
import { GetMandateSchemeUsageQuery } from "../get-mandate-scheme-usage.query.js";

/** La vue vient du VRAI mapper : un doublé écrit à la main dériverait de la vue servie. */
class FixedEntities extends LegalEntityReader {
  constructor(private readonly view: LegalEntityView | null) {
    super();
  }

  list(): Promise<readonly LegalEntityView[]> {
    return Promise.resolve(this.view === null ? [] : [this.view]);
  }

  byId(): Promise<LegalEntityView | null> {
    return Promise.resolve(this.view);
  }
}

class FixedUsage extends IssuedMandatesReader {
  readonly asked: string[] = [];

  constructor(private readonly usage: IssuedMandatesUsage) {
    super();
  }

  usageOf(creditorId: string): Promise<IssuedMandatesUsage> {
    this.asked.push(creditorId);
    return Promise.resolve(this.usage);
  }
}

const USAGE: IssuedMandatesUsage = { activeByScheme: { CORE: 2, B2B: 5 }, drafts: 3 };

describe("GetMandateSchemeUsageHandler — ce qu'une bascule laisserait derrière elle", () => {
  it("rend le schéma courant de l'entité, les actifs par schéma et les brouillons", async () => {
    const entity = declaredEntity();
    entity.changeMandateScheme("CORE");
    const usage = new FixedUsage(USAGE);
    const handler = new GetMandateSchemeUsageHandler(
      new FixedEntities(toView(entity, true)),
      usage,
    );

    await expect(handler.execute(new GetMandateSchemeUsageQuery("le1"))).resolves.toEqual({
      scheme: "CORE",
      activeByScheme: { CORE: 2, B2B: 5 },
      drafts: 3,
    });
    expect(usage.asked).toEqual(["le1"]);
  });

  it("refuse une entité inconnue en 404, avant de compter quoi que ce soit", async () => {
    const usage = new FixedUsage(USAGE);
    const handler = new GetMandateSchemeUsageHandler(new FixedEntities(null), usage);

    await expect(
      handler.execute(new GetMandateSchemeUsageQuery("inconnue")),
    ).rejects.toBeInstanceOf(LegalEntityNotFoundError);
    expect(usage.asked).toEqual([]);
  });
});
