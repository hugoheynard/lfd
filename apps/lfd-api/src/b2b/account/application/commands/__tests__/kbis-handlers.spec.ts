import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import {
  CompanyAdminRequiredError,
  CompanyNotFoundError,
  KbisNotFoundError,
} from "../../../domain/errors/account-errors.js";
import {
  CompanyRepository,
  type KbisLocation,
  type KbisMetadata,
} from "../../../domain/ports/company.repository.js";
import { DocumentStore } from "../../../../../platform/storage/document-store.js";
import { MembershipReader } from "../../../domain/ports/membership.reader.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { DownloadKbisQuery } from "../../queries/download-kbis.query.js";
import { DownloadKbisHandler } from "../../queries/download-kbis.handler.js";
import { UploadKbisCommand } from "../upload-kbis.command.js";
import { UploadKbisHandler } from "../upload-kbis.handler.js";

const PDF = Buffer.from("%PDF-1.4\nx", "latin1");

function membership(role: CompanyRole | null): MembershipReader {
  return { roleOf: () => Promise.resolve(role) };
}

describe("UploadKbisHandler", () => {
  interface Doubles {
    handler: UploadKbisHandler;
    saved: { key: string; meta: KbisMetadata | null };
  }

  function doubles(role: CompanyRole | null): Doubles {
    const saved: Doubles["saved"] = { key: "", meta: null };
    const store: DocumentStore = {
      save: (key: string) => {
        saved.key = key;
        return Promise.resolve(key);
      },
      read: () => Promise.resolve(Buffer.alloc(0)),
    };
    const companies = {
      existsBySiret: () => Promise.resolve(false),
      declareOwnedBy: () => Promise.resolve("c"),
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      declareUnowned: () => Promise.resolve("c"),
      saveKbisCertification: () => Promise.resolve(),
      saveKbisMetadata: (_companyId: string, meta: KbisMetadata) => {
        saved.meta = meta;
        return Promise.resolve();
      },
      kbisLocation: () => Promise.resolve(null),
    } satisfies CompanyRepository;
    // La pièce d'activation n'est pas l'objet de ce spec — le double la garde
    // sans rien en faire.
    const events = new RecordingPublisher();
    return { handler: new UploadKbisHandler(membership(role), store, companies, events), saved };
  }

  it("range le fichier PUIS écrit les métadonnées, pour le gestionnaire", async () => {
    const { handler, saved } = doubles("owner");

    await handler.execute(new UploadKbisCommand("u1", "c1", "kbis.pdf", PDF));

    // Métadonnées cohérentes avec la clé rendue par le stockage.
    expect(saved.meta).toMatchObject({
      storageKey: saved.key,
      fileName: "kbis.pdf",
      contentType: "application/pdf",
    });
  });

  it("refuse un non-membre (404) et un simple membre (403), sans rien stocker", async () => {
    const stranger = doubles(null);
    await expect(
      stranger.handler.execute(new UploadKbisCommand("u1", "c1", "kbis.pdf", PDF)),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
    expect(stranger.saved.meta).toBeNull();

    const member = doubles("orders");
    await expect(
      member.handler.execute(new UploadKbisCommand("u1", "c1", "kbis.pdf", PDF)),
    ).rejects.toBeInstanceOf(CompanyAdminRequiredError);
    expect(member.saved.meta).toBeNull();
  });

  it("rejette un fichier non-PDF avant tout stockage", async () => {
    const { handler, saved } = doubles("owner");

    await expect(
      handler.execute(new UploadKbisCommand("u1", "c1", "faux.pdf", Buffer.from("nope"))),
    ).rejects.toThrow(/PDF/u);
    expect(saved.meta).toBeNull();
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
    };
    const companies = {
      existsBySiret: () => Promise.resolve(false),
      declareOwnedBy: () => Promise.resolve("c"),
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      declareUnowned: () => Promise.resolve("c"),
      saveKbisCertification: () => Promise.resolve(),
      saveKbisMetadata: () => Promise.resolve(),
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
