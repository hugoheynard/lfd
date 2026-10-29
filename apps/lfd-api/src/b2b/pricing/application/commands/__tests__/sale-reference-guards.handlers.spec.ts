/**
 * **Les éditeurs de mercuriale et d'engagement refusent une référence hors
 * vente** (L5 de `plan-pro-voit-les-declinaisons.md`, 2026-10-29). Avant, ni
 * l'un ni l'autre ne lisait le catalogue : un SKU inexistant, archivé ou mal
 * tapé créait une décision qui ne s'appliquait jamais.
 *
 * Ports doublés par de vraies sous-classes. Les dates ne sont comparées qu'à la
 * fixture, jamais au mur.
 */
import type { CreateVolumeCommitmentPayload, PoseCompanyMercurialePayload } from "@lfd/contracts";

import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { ArticleSaleUnits } from "../../../../catalog/application/article-sale-units.service.js";
import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../../../catalog/domain/ports/catalog.reader.js";
import type { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import type { VolumeCommitmentAggregate } from "../../../domain/entities/volume-commitment.js";
import { CompanyMercurialeRepository } from "../../../domain/ports/company-mercuriale.repository.js";
import { PricedCompanyNamer } from "../../../domain/ports/priced-company-namer.js";
import { PricedCompanyReader } from "../../../domain/ports/priced-company.reader.js";
import { PricedDecisionsReader } from "../../../domain/ports/priced-decisions.reader.js";
import { VolumeCommitmentRepository } from "../../../domain/ports/volume-commitment.repository.js";
import {
  SaleReferenceNotOnSaleError,
  SaleReferenceWithdrawnError,
} from "../../../domain/pricing-errors.js";
import { InMemorySaleReferences } from "../../../infrastructure/in-memory-sale-references.js";
import {
  MercurialeDraftStore,
  type StoredMercurialeDraft,
} from "../../ports/mercuriale-draft.store.js";
import { PoseCompanyMercurialeCommand } from "../pose-company-mercuriale.command.js";
import { PoseCompanyMercurialeHandler } from "../pose-company-mercuriale.handler.js";
import { SignVolumeCommitmentCommand } from "../sign-volume-commitment.command.js";
import { SignVolumeCommitmentHandler } from "../sign-volume-commitment.handler.js";

const FROM = "2026-06-01T00:00:00.000Z";
const TO = "2026-07-01T00:00:00.000Z";
const REFERENCES = new InMemorySaleReferences(["VIE-001", "VIE-001-2"], ["PAI-009"]);

class KnownCompanies extends PricedCompanyReader {
  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class NamedCompanies extends PricedCompanyNamer {
  nameOf(): Promise<string | null> {
    return Promise.resolve("Hôtel du Lac");
  }
}

class NothingPriced extends PricedDecisionsReader {
  hasPriced(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

class RecordingMercuriales extends CompanyMercurialeRepository {
  readonly saved: CompanyMercuriale[] = [];
  save(mercuriale: CompanyMercuriale): Promise<void> {
    this.saved.push(mercuriale);
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

class RecordingCommitments extends VolumeCommitmentRepository {
  readonly signed: VolumeCommitmentAggregate[] = [];
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  sign(commitment: VolumeCommitmentAggregate): Promise<void> {
    this.signed.push(commitment);
    return Promise.resolve();
  }
  load(): Promise<VolumeCommitmentAggregate | null> {
    return Promise.resolve(null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

/** Un catalogue où rien ne se vend au poids : seul `listByShopSkus` est lu. */
class PieceOnlyCatalog extends CatalogReader {
  findSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.resolve(null);
  }
  listSellable(): Promise<ResolvedCatalogItem[]> {
    return Promise.resolve([]);
  }
  findByShopSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.resolve(null);
  }
  listByShopSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.resolve(new Map());
  }
}

function poseMercuriale(skus: readonly string[]) {
  const mercuriales = new RecordingMercuriales();
  const handler = new PoseCompanyMercurialeHandler(
    new KnownCompanies(),
    mercuriales,
    new FixedIdGenerator("mer"),
    new NoDrafts(),
    new NothingPriced(),
    REFERENCES,
  );
  const payload: PoseCompanyMercurialePayload = {
    label: "Été",
    validFrom: FROM,
    validTo: TO,
    lines: skus.map((sku) => ({ sku, unitPriceMillicents: 180_000 })),
  };
  return {
    mercuriales,
    run: () => handler.execute(new PoseCompanyMercurialeCommand("co_1", payload, "staff_1")),
  };
}

function signCommitment(sku: string) {
  const commitments = new RecordingCommitments();
  const handler = new SignVolumeCommitmentHandler(
    commitments,
    new FixedIdGenerator("vc"),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
    new NothingPriced(),
    new NamedCompanies(),
    new ArticleSaleUnits(new PieceOnlyCatalog()),
    REFERENCES,
  );
  const payload: CreateVolumeCommitmentPayload = {
    companyId: "co_1",
    scope: { type: "product", id: sku },
    promisedQuantity: 500,
    validFrom: FROM,
    validTo: TO,
  };
  return {
    commitments,
    run: () => handler.execute(new SignVolumeCommitmentCommand(payload, "staff_1")),
  };
}

describe("PoseCompanyMercurialeHandler — les références de la grille", () => {
  it("pose une grille dont chaque ligne est en vente, déclinaison comprise", async () => {
    const { mercuriales, run } = poseMercuriale(["VIE-001", "VIE-001-2"]);
    await expect(run()).resolves.toBe(2);
    expect(mercuriales.saved).toHaveLength(1);
  });

  it("refuse la grille entière quand UNE ligne parmi plusieurs est inconnue, et la nomme", async () => {
    const { mercuriales, run } = poseMercuriale(["VIE-001", "VIE-01", "VIE-001-2"]);
    await expect(run()).rejects.toBeInstanceOf(SaleReferenceNotOnSaleError);
    await expect(run()).rejects.toThrow(/« VIE-01 »/);
    expect(mercuriales.saved).toHaveLength(0);
  });

  it("refuse une ligne sur un article retiré, avec son propre message", async () => {
    const { mercuriales, run } = poseMercuriale(["VIE-001", "PAI-009"]);
    await expect(run()).rejects.toBeInstanceOf(SaleReferenceWithdrawnError);
    expect(mercuriales.saved).toHaveLength(0);
  });
});

describe("SignVolumeCommitmentHandler — la référence engagée", () => {
  it("signe un engagement sur une référence en vente", async () => {
    const { commitments, run } = signCommitment("VIE-001");
    await expect(run()).resolves.toBe("vc_000001");
    expect(commitments.signed).toHaveLength(1);
  });

  it("refuse une référence inconnue sans rien signer", async () => {
    const { commitments, run } = signCommitment("VIE-01");
    await expect(run()).rejects.toBeInstanceOf(SaleReferenceNotOnSaleError);
    expect(commitments.signed).toHaveLength(0);
  });

  it("refuse un article retiré sans rien signer", async () => {
    const { commitments, run } = signCommitment("PAI-009");
    await expect(run()).rejects.toBeInstanceOf(SaleReferenceWithdrawnError);
    expect(commitments.signed).toHaveLength(0);
  });
});
