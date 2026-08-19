import { DocumentStore, type StoredDocument } from "../../../../platform/storage/document-store.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  PaymentMandate,
  type MandateToCreate,
  type RegisteredMandate,
} from "../../domain/entities/payment-mandate.js";
import {
  CompanyNotFoundForMandateError,
  MandateAlreadyActiveError,
  MandateNotFoundError,
} from "../../domain/errors/mandate-errors.js";
import { MandateGateway, type MandateToRegister } from "../../domain/mandate-gateway.js";
import {
  PaymentMandateRepository,
  type MandateHolder,
} from "../../domain/payment-mandate.repository.js";
import {
  AttachMandateProofCommand,
  RegisterMandateCommand,
  RevokeMandateCommand,
} from "../mandate-commands.js";
import {
  AttachMandateProofHandler,
  RegisterMandateHandler,
  RevokeMandateHandler,
} from "../mandate.handlers.js";

const NOW = new Date("2026-08-11T10:00:00.000Z");
const PDF = Buffer.from("%PDF-1.4\nmandat", "latin1");

const REGISTRATION: RegisteredMandate = {
  stripeCustomerId: "cus_1",
  paymentMethodId: "pm_1",
  reference: "RUM-123",
  last4: "3000",
  bankCode: "BNPA",
  country: "FR",
  status: "active",
};

/** Ce que les doubles ont observé — l'ordre des gestes compte autant que leur effet. */
interface Trace {
  readonly steps: string[];
  written: MandateToCreate | null;
  registered: MandateToRegister | null;
  saved: PaymentMandate | null;
  stored: { key: string; document: StoredDocument } | null;
}

function doubles(options: {
  readonly current?: PaymentMandate | null;
  readonly holder?: MandateHolder | null;
  readonly customerId?: string | null;
}): {
  readonly repo: PaymentMandateRepository;
  readonly gateway: MandateGateway;
  readonly trace: Trace;
} {
  const trace: Trace = { steps: [], written: null, registered: null, saved: null, stored: null };

  const repo: PaymentMandateRepository = {
    findCurrent: () => Promise.resolve(options.current ?? null),
    findById: () => Promise.resolve(null),
    create: (mandate) => {
      trace.steps.push("write");
      trace.written = mandate;
      return Promise.resolve("mdt_new");
    },
    save: (mandate) => {
      trace.steps.push("save");
      trace.saved = mandate;
      return Promise.resolve();
    },
    findHolder: () =>
      Promise.resolve(
        options.holder === undefined
          ? { companyName: "Café des Halles SAS", email: "camille@halles.fr" }
          : options.holder,
      ),
    findStripeCustomerId: () => Promise.resolve(options.customerId ?? null),
  };

  const gateway: MandateGateway = {
    registerMandate: (input) => {
      trace.steps.push("gateway");
      trace.registered = input;
      return Promise.resolve(REGISTRATION);
    },
    revokeMandate: () => {
      trace.steps.push("gateway");
      return Promise.resolve();
    },
  };

  return { repo, gateway, trace };
}

function activeMandate(): PaymentMandate {
  return PaymentMandate.reconstitute({
    ...REGISTRATION,
    id: "mdt_1",
    companyId: "cmp_1",
    acceptedAt: new Date("2024-03-12T00:00:00.000Z"),
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
  });
}

describe("RegisterMandateHandler", () => {
  it("appelle le PRESTATAIRE avant d'écrire", async () => {
    // L'invariant du handler : écrire d'abord laisserait un mandat « actif »
    // chez nous que rien n'autorise chez eux — et c'est celui-là qu'on croirait
    // pouvoir prélever.
    const { repo, gateway, trace } = doubles({});
    const handler = new RegisterMandateHandler(repo, gateway, new FixedClock(NOW));

    const id = await handler.execute(new RegisterMandateCommand("cmp_1", "pm_1", null));

    expect(id).toBe("mdt_new");
    expect(trace.steps).toEqual(["gateway", "write"]);
  });

  it("déclare la date du PAPIER signé, pas celle de la saisie", async () => {
    const signedOn = new Date("2024-03-12T00:00:00.000Z");
    const { repo, gateway, trace } = doubles({});
    const handler = new RegisterMandateHandler(repo, gateway, new FixedClock(NOW));

    await handler.execute(new RegisterMandateCommand("cmp_1", "pm_1", signedOn));

    expect(trace.registered?.acceptedAt).toEqual(signedOn);
    expect(trace.written?.acceptedAt).toEqual(signedOn);
  });

  it("RÉUTILISE le client Stripe déjà connu de la société", async () => {
    // Un client Stripe par société, pas par autorisation : sinon l'historique se
    // fragmente et le portefeuille devient illisible côté prestataire.
    const { repo, gateway, trace } = doubles({ customerId: "cus_existant" });
    const handler = new RegisterMandateHandler(repo, gateway, new FixedClock(NOW));

    await handler.execute(new RegisterMandateCommand("cmp_1", "pm_2", null));

    expect(trace.registered?.existingCustomerId).toBe("cus_existant");
  });

  it("REFUSE un second mandat tant que le premier est actif", async () => {
    // Deux autorisations actives, et plus rien ne dit sur laquelle on a prélevé.
    const { repo, gateway, trace } = doubles({ current: activeMandate() });
    const handler = new RegisterMandateHandler(repo, gateway, new FixedClock(NOW));

    await expect(
      handler.execute(new RegisterMandateCommand("cmp_1", "pm_2", null)),
    ).rejects.toBeInstanceOf(MandateAlreadyActiveError);
    expect(trace.steps).toEqual([]);
  });

  it("refuse pour une société inconnue, SANS toucher au prestataire", async () => {
    const { repo, gateway, trace } = doubles({ holder: null });
    const handler = new RegisterMandateHandler(repo, gateway, new FixedClock(NOW));

    await expect(
      handler.execute(new RegisterMandateCommand("fantome", "pm_1", null)),
    ).rejects.toBeInstanceOf(CompanyNotFoundForMandateError);
    expect(trace.steps).toEqual([]);
  });
});

describe("RevokeMandateHandler", () => {
  it("détache chez le PRESTATAIRE avant de marquer révoqué", async () => {
    // Ordre inverse de l'enregistrement, même raison : tant que le moyen est
    // attaché chez Stripe, un prélèvement peut partir.
    const { repo, gateway, trace } = doubles({ current: activeMandate() });
    const handler = new RevokeMandateHandler(repo, gateway, new FixedClock(NOW));

    await handler.execute(new RevokeMandateCommand("cmp_1"));

    expect(trace.steps).toEqual(["gateway", "save"]);
    expect(trace.saved?.status).toBe("revoked");
  });

  it("refuse quand la société n'a jamais eu de mandat", async () => {
    const { repo, gateway } = doubles({ current: null });
    const handler = new RevokeMandateHandler(repo, gateway, new FixedClock(NOW));

    await expect(handler.execute(new RevokeMandateCommand("cmp_1"))).rejects.toBeInstanceOf(
      MandateNotFoundError,
    );
  });
});

describe("AttachMandateProofHandler", () => {
  it("range la pièce AVANT d'écrire sa référence", async () => {
    // Si le stockage échoue, la base ne doit pas pointer vers une pièce absente :
    // un mandat qu'on croit prouvé sans l'être est pire qu'un mandat qu'on sait nu.
    const { repo, trace } = doubles({ current: activeMandate() });
    const store: DocumentStore = {
      save: (key, document) => {
        trace.steps.push("store");
        trace.stored = { key, document };
        return Promise.resolve(key);
      },
      read: () => Promise.resolve(Buffer.alloc(0)),
    };
    const handler = new AttachMandateProofHandler(repo, store);

    await handler.execute(new AttachMandateProofCommand("cmp_1", "mandat.pdf", PDF));

    expect(trace.steps).toEqual(["store", "save"]);
    expect(trace.saved?.proven()).toBe(true);
  });

  it("ancre la clé sur la société ET sur le mandat", async () => {
    // Un mandat remplacé garde sa preuve — sinon l'historique qu'on tient tant à
    // conserver perdrait la seule pièce qui le justifie.
    const { repo, trace } = doubles({ current: activeMandate() });
    const store: DocumentStore = {
      save: (key, document) => {
        trace.stored = { key, document };
        return Promise.resolve(key);
      },
      read: () => Promise.resolve(Buffer.alloc(0)),
    };
    const handler = new AttachMandateProofHandler(repo, store);

    await handler.execute(new AttachMandateProofCommand("cmp_1", "mandat.pdf", PDF));

    expect(trace.stored?.key).toBe("companies/cmp_1/mandates/mdt_1/mandat-signe");
    expect(trace.stored?.document.contentType).toBe("application/pdf");
  });

  it("refuse une pièce dont les octets ne sont pas une pièce", async () => {
    const { repo } = doubles({ current: activeMandate() });
    const store: DocumentStore = {
      save: (key) => Promise.resolve(key),
      read: () => Promise.resolve(Buffer.alloc(0)),
    };
    const handler = new AttachMandateProofHandler(repo, store);

    await expect(
      handler.execute(
        new AttachMandateProofCommand("cmp_1", "mandat.pdf", Buffer.from("MZ\x90\x00", "latin1")),
      ),
    ).rejects.toThrow(/Pièce invalide/u);
  });
});
