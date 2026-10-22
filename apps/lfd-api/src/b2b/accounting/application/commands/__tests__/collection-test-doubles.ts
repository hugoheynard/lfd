import type { CollectionTest } from "../../../domain/entities/collection-test.js";
import type { OwnEstablishment } from "../../../domain/entities/own-establishment.js";
import { BatchedMandatesReader } from "../../../domain/ports/batched-mandates.reader.js";
import {
  EstablishmentCompaniesReader,
  type EstablishmentCompany,
} from "../../../domain/ports/establishment-companies.reader.js";
import { OwnEstablishmentRepository } from "../../../domain/ports/own-establishment.repository.js";
import {
  OwnEstablishmentsReader,
  type OwnEstablishmentRow,
} from "../../../domain/ports/own-establishments.reader.js";
import { CollectionTestRepository } from "../../../domain/ports/collection-test.repository.js";
import {
  CollectionTestReturnTargetsReader,
  type CollectionTestReturnTarget,
} from "../../../domain/ports/collection-test-return-targets.reader.js";

/** Les essais en mémoire ; `save` crée ou réécrit. */
export class MemoryCollectionTests extends CollectionTestRepository {
  readonly saved = new Map<string, CollectionTest>();
  saveCount = 0;

  load(id: string): Promise<CollectionTest | null> {
    return Promise.resolve(this.saved.get(id) ?? null);
  }

  byEndToEndIds(endToEndIds: readonly string[]): Promise<ReadonlyMap<string, CollectionTest>> {
    return Promise.resolve(
      new Map(
        [...this.saved.values()]
          .filter((test) => endToEndIds.includes(test.endToEndId))
          .map((test) => [test.endToEndId, test]),
      ),
    );
  }

  save(test: CollectionTest): Promise<void> {
    this.saveCount += 1;
    this.saved.set(test.id, test);
    return Promise.resolve();
  }
}

/** Ce que l'appariement lit des essais en mémoire. */
export class MemoryTestReturnTargets extends CollectionTestReturnTargetsReader {
  constructor(private readonly tests: MemoryCollectionTests) {
    super();
  }

  async byEndToEndIds(
    endToEndIds: readonly string[],
  ): Promise<ReadonlyMap<string, CollectionTestReturnTarget>> {
    const found = await this.tests.byEndToEndIds(endToEndIds);
    return new Map(
      [...found.entries()].map(([endToEndId, test]) => [
        endToEndId,
        {
          testId: test.id,
          messageId: test.toPersistence().messageId,
          debtorName: test.debtorName,
          amountCents: test.amountCents,
          returned: test.hasBankReturn,
        },
      ]),
    );
  }
}

/** Nos établissements en mémoire ; `save` crée ou réécrit, comme l'`upsert`. */
export class MemoryOwnEstablishments extends OwnEstablishmentRepository {
  readonly saved = new Map<string, OwnEstablishment>();

  load(companyId: string): Promise<OwnEstablishment | null> {
    return Promise.resolve(this.saved.get(companyId) ?? null);
  }

  save(establishment: OwnEstablishment): Promise<void> {
    this.saved.set(establishment.companyId, establishment);
    return Promise.resolve();
  }
}

/** Des sociétés écrites à la main ; « déclarée » se lit dans les établissements en mémoire. */
export class FakeEstablishmentCompanies extends EstablishmentCompaniesReader {
  readonly companies = new Map<string, { readonly name: string; readonly status: string }>();

  constructor(private readonly establishments: MemoryOwnEstablishments) {
    super();
  }

  companyOf(companyId: string): Promise<EstablishmentCompany | null> {
    const company = this.companies.get(companyId);
    if (company === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      companyId,
      name: company.name,
      status: company.status,
      declared: this.establishments.saved.get(companyId)?.isDeclared ?? false,
    });
  }
}

/** La liste des établissements déclarés, lue dans la mémoire. */
export class MemoryOwnEstablishmentsReader extends OwnEstablishmentsReader {
  constructor(
    private readonly establishments: MemoryOwnEstablishments,
    private readonly companies: FakeEstablishmentCompanies,
  ) {
    super();
  }

  async list(): Promise<readonly OwnEstablishmentRow[]> {
    const rows: OwnEstablishmentRow[] = [];
    for (const establishment of this.establishments.saved.values()) {
      const company = await this.companies.companyOf(establishment.companyId);
      const state = establishment.toPersistence();
      if (company !== null && establishment.isDeclared) {
        rows.push({
          companyId: company.companyId,
          companyName: company.name,
          companyStatus: company.status,
          declaredAt: state.declared.at,
          declaredByStaffId: state.declared.staffId,
        });
      }
    }
    return rows;
  }
}

/** Les mandats qu'un lot porte, écrits à la main. */
export class FakeBatchedMandates extends BatchedMandatesReader {
  readonly ids = new Set<string>();

  batched(mandateIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(mandateIds.filter((id) => this.ids.has(id))));
  }
}
