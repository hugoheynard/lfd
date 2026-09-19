import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import {
  CompanyAdminRequiredError,
  CompanyNotFoundError,
  KbisNotFoundError,
} from "../../../domain/errors/account-errors.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import { Company } from "../../../domain/entities/company.js";
import type { KbisDeposit } from "../../../domain/value-objects/kbis-deposit.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { DocumentStore } from "../../../../../platform/storage/document-store.js";
import { MembershipReader } from "../../../domain/ports/membership.reader.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { DownloadKbisQuery } from "../../queries/download-kbis.query.js";
import { DownloadKbisHandler } from "../../queries/download-kbis.handler.js";
import { UploadKbisCommand } from "../upload-kbis.command.js";
import { UploadKbisHandler } from "../upload-kbis.handler.js";

const PDF = Buffer.from("%PDF-1.4\nx", "latin1");
const DEPOSITED_AT = new Date("2026-02-03T10:00:00Z");

/** Une société déclarée, sans papiers — l'état de départ du dépôt. */
function sampleCompany(): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "active",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

function membership(role: CompanyRole | null): MembershipReader {
  return { roleOf: () => Promise.resolve(role) };
}

describe("UploadKbisHandler", () => {
  interface Doubles {
    handler: UploadKbisHandler;
    saved: { key: string; kbis: KbisDeposit | null };
    company: Company;
    events: RecordingPublisher;
  }

  function doubles(role: CompanyRole | null): Doubles {
    const saved: Doubles["saved"] = { key: "", kbis: null };
    const company = sampleCompany();
    const store: DocumentStore = {
      save: (key: string) => {
        saved.key = key;
        return Promise.resolve(key);
      },
      read: () => Promise.resolve(Buffer.alloc(0)),
      // Toujours ABSENT : rien n'a été rangé par ce doublé, donc chaque
      // lecture doit dire « pas encore » plutôt que rendre une pièce.
      readIfPresent: () => Promise.resolve(null),
      delete: () => Promise.resolve(),
    };
    const companies = {
      existsBySiret: () => Promise.resolve(false),
      declareOwnedBy: () => Promise.resolve("c"),
      // Le MÊME agrégat d'un appel à l'autre : c'est ce qui permet d'éprouver
      // un remplacement d'extrait sur un état déjà certifié.
      load: () => Promise.resolve(company),
      save: (written: Company) => {
        saved.kbis = written.kbis;
        return Promise.resolve();
      },
      declareUnowned: () => Promise.resolve("c"),
      kbisLocation: () => Promise.resolve(null),
    } satisfies CompanyRepository;
    // Garde la pièce d'activation (best-effort) et le fait tracé du dépôt.
    const events = new RecordingPublisher();
    return {
      handler: new UploadKbisHandler(
        membership(role),
        store,
        companies,
        events,
        new FixedClock(DEPOSITED_AT),
      ),
      saved,
      company,
      events,
    };
  }

  it("range le fichier PUIS écrit les métadonnées, pour le gestionnaire", async () => {
    const { handler, saved } = doubles("owner");

    await handler.execute(new UploadKbisCommand("u1", "c1", "kbis.pdf", PDF));

    // Métadonnées cohérentes avec la clé rendue par le stockage.
    expect(saved.kbis?.file).toMatchObject({
      storageKey: saved.key,
      fileName: "kbis.pdf",
      contentType: "application/pdf",
      uploadedAt: DEPOSITED_AT,
    });
  });

  /**
   * **Régression : un remplacement d'extrait laissait la certification.**
   *
   * La remise à zéro vivait dans l'adaptateur Prisma, qui nullait quatre
   * colonnes en même temps qu'il écrivait les métadonnées. Un second chemin
   * d'écriture — ou un adaptateur en mémoire — l'aurait perdue sans bruit, et
   * le nom d'un agent serait resté sur un extrait qu'il n'a jamais vu.
   */
  it("dépose un extrait NON CERTIFIÉ, même quand le précédent l'était", async () => {
    const { handler, saved, company } = doubles("owner");

    await handler.execute(new UploadKbisCommand("u1", "c1", "kbis.pdf", PDF));
    company.certifyKbis({
      at: DEPOSITED_AT,
      byStaffUserId: "staff_1",
      byName: "Marc",
      byRole: "comptabilite",
    });
    expect(company.kbis?.certified).toBe(true);

    await handler.execute(new UploadKbisCommand("u1", "c1", "kbis-v2.pdf", PDF));

    expect(saved.kbis?.file.fileName).toBe("kbis-v2.pdf");
    expect(saved.kbis?.certified).toBe(false);
  });

  it("refuse un non-membre (404) et un simple membre (403), sans rien stocker", async () => {
    const stranger = doubles(null);
    await expect(
      stranger.handler.execute(new UploadKbisCommand("u1", "c1", "kbis.pdf", PDF)),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
    expect(stranger.saved.kbis).toBeNull();

    const member = doubles("orders");
    await expect(
      member.handler.execute(new UploadKbisCommand("u1", "c1", "kbis.pdf", PDF)),
    ).rejects.toBeInstanceOf(CompanyAdminRequiredError);
    expect(member.saved.kbis).toBeNull();
  });

  it("rejette un fichier non-PDF avant tout stockage — et n'écrit aucun fait", async () => {
    const { handler, saved, events } = doubles("owner");

    await expect(
      handler.execute(new UploadKbisCommand("u1", "c1", "faux.pdf", Buffer.from("nope"))),
    ).rejects.toThrow(/PDF/u);
    expect(saved.kbis).toBeNull();
    expect(events.traced).toHaveLength(0);
  });

  it("journalise le dépôt sous le même fait que le staff, après l'écriture", async () => {
    const { handler, events } = doubles("owner");

    await handler.execute(new UploadKbisCommand("u1", "c1", "kbis.pdf", PDF));

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "company.kbis_uploaded",
        subjectType: "company",
        subjectId: "c1",
        payload: { fileName: "kbis.pdf" },
      },
    ]);
  });
});

describe("DownloadKbisHandler", () => {
  function handlerFor(
    role: CompanyRole | null,
    location: KbisLocation | null,
    bytes = PDF,
  ): DownloadKbisHandler {
    const store: DocumentStore = {
      save: () => Promise.resolve("k"),
      read: () => Promise.resolve(bytes),
      // Toujours ABSENT : rien n'a été rangé par ce doublé, donc chaque
      // lecture doit dire « pas encore » plutôt que rendre une pièce.
      readIfPresent: () => Promise.resolve(null),
      delete: () => Promise.resolve(),
    };
    const companies = {
      existsBySiret: () => Promise.resolve(false),
      declareOwnedBy: () => Promise.resolve("c"),
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      declareUnowned: () => Promise.resolve("c"),
      kbisLocation: () => Promise.resolve(location),
    } satisfies CompanyRepository;
    return new DownloadKbisHandler(membership(role), companies, store);
  }

  const location: KbisLocation = {
    storageKey: "companies/c1/kbis.pdf",
    fileName: "kbis.pdf",
    contentType: "application/pdf",
  };

  it("sert le fichier à tout membre (même simple)", async () => {
    const result = await handlerFor("orders", location).execute(new DownloadKbisQuery("u1", "c1"));
    expect(result).toMatchObject({ fileName: "kbis.pdf", contentType: "application/pdf" });
  });

  it("cache l'entreprise à un non-membre (404)", async () => {
    await expect(
      handlerFor(null, location).execute(new DownloadKbisQuery("u1", "c1")),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
  });

  it("404 quand aucun KBIS n'a été déposé", async () => {
    await expect(
      handlerFor("owner", null).execute(new DownloadKbisQuery("u1", "c1")),
    ).rejects.toBeInstanceOf(KbisNotFoundError);
  });
});
