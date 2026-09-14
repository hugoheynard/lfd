import { DocumentStore, type StoredDocument } from "../../../../platform/storage/document-store.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  PaymentMandate,
  type MandateToCreate,
  type RegisteredMandate,
} from "../../domain/entities/payment-mandate.js";
import { AesGcmFieldCipher } from "../../../../platform/crypto/aes-gcm-field-cipher.js";
import {
  MandateNotFoundError,
  MandateNotProvableError,
} from "../../domain/errors/mandate-errors.js";
import { MandateGateway, type MandateToRegister } from "../../domain/mandate-gateway.js";
import {
  PaymentMandateRepository,
  type MandateHolder,
} from "../../domain/payment-mandate.repository.js";
import { AttachMandateProofCommand, RevokeMandateCommand } from "../mandate-commands.js";
import { AttachMandateProofHandler, RevokeMandateHandler } from "../mandate.handlers.js";

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
  readonly draft?: PaymentMandate | null;
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
    findDraft: () => Promise.resolve(options.draft ?? null),
    findAwaitingProof: () => Promise.resolve(options.draft ?? options.current ?? null),
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
          ? {
              companyName: "Café des Halles SAS",
              email: "camille@halles.fr",
              reference: "C-7K2M4P",
            }
          : options.holder,
      ),
    findStripeCustomerId: () => Promise.resolve(options.customerId ?? null),
  };

  const gateway: MandateGateway = {
    revokeMandate: () => {
      trace.steps.push("gateway");
      return Promise.resolve();
    },
  };

  return { repo, gateway, trace };
}

/** Le brouillon frappé qui attend son scan — le seul mandat qui en reçoit un. */
function draftMandate(): PaymentMandate {
  return PaymentMandate.reconstitute({
    ...REGISTRATION,
    id: "mdt_1",
    companyId: "cmp_1",
    stripeCustomerId: null,
    paymentMethodId: null,
    status: "draft",
    acceptedAt: null,
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
    creditorId: "ent_1",
  });
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
    creditorId: null,
  });
}

/**
 * Un vrai coffre plutôt qu'un doublé : le scellement est déterministe dans son
 * effet (aller-retour) et son coût est nul. Un doublé qui rendrait les octets
 * tels quels laisserait passer un handler qui oublie de sceller.
 */
const CIPHER = new AesGcmFieldCipher(Buffer.alloc(32, 5));

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

/** Un coffre qui trace ce qu'on lui confie, dans l'ordre des gestes. */
function tracingStore(trace: Trace): DocumentStore {
  return {
    save: (key, document) => {
      trace.steps.push("store");
      trace.stored = { key, document };
      return Promise.resolve(key);
    },
    read: () => Promise.resolve(Buffer.alloc(0)),
    // Toujours ABSENT : rien n'a été rangé par ce doublé, donc chaque lecture
    // doit dire « pas encore » plutôt que rendre une pièce.
    readIfPresent: () => Promise.resolve(null),
  };
}

describe("AttachMandateProofHandler", () => {
  it("range la pièce AVANT d'écrire sa référence", async () => {
    // Si le stockage échoue, la base ne doit pas pointer vers une pièce absente :
    // un mandat qu'on croit prouvé sans l'être est pire qu'un mandat qu'on sait nu.
    const { repo, trace } = doubles({ draft: draftMandate() });
    const handler = new AttachMandateProofHandler(
      repo,
      tracingStore(trace),
      CIPHER,
      new FixedClock(NOW),
    );

    await handler.execute(new AttachMandateProofCommand("cmp_1", "mandat.pdf", PDF));

    expect(trace.steps).toEqual(["store", "save"]);
    expect(trace.saved?.proven()).toBe(true);
  });

  it("vise le BROUILLON quand un actif est encore en vigueur", async () => {
    // En rotation bancaire, le papier qui revient est celui qu'on vient d'envoyer.
    const { repo, trace } = doubles({ current: activeMandate(), draft: draftMandate() });
    const handler = new AttachMandateProofHandler(
      repo,
      tracingStore(trace),
      CIPHER,
      new FixedClock(NOW),
    );

    await handler.execute(new AttachMandateProofCommand("cmp_1", "mandat.pdf", PDF));

    expect(trace.saved?.status).toBe("draft");
  });

  /**
   * 🔴 Régression (2026-09-14) : le refus hors brouillon tombait APRÈS le
   * rangement. Le fichier du bucket était déjà remplacé quand l'agrégat disait
   * non, et la base désignait toujours l'ancienne pièce.
   */
  it("refuse le scan d'un mandat ACTIF sans rien ranger", async () => {
    const { repo, trace } = doubles({ current: activeMandate(), draft: null });
    const handler = new AttachMandateProofHandler(
      repo,
      tracingStore(trace),
      CIPHER,
      new FixedClock(NOW),
    );

    await expect(
      handler.execute(new AttachMandateProofCommand("cmp_1", "mandat.pdf", PDF)),
    ).rejects.toBeInstanceOf(MandateNotProvableError);
    expect(trace.steps).toEqual([]);
    expect(trace.stored).toBeNull();
  });

  it("refuse quand la société n'a aucun mandat, sans rien ranger", async () => {
    const { repo, trace } = doubles({ current: null, draft: null });
    const handler = new AttachMandateProofHandler(
      repo,
      tracingStore(trace),
      CIPHER,
      new FixedClock(NOW),
    );

    await expect(
      handler.execute(new AttachMandateProofCommand("cmp_1", "mandat.pdf", PDF)),
    ).rejects.toBeInstanceOf(MandateNotFoundError);
    expect(trace.steps).toEqual([]);
  });

  it("ancre la clé sur la société, le mandat ET l'instant du dépôt", async () => {
    // Un mandat remplacé garde sa preuve ; et une clé neuve par dépôt fait qu'une
    // écriture en base qui échoue ne recouvre pas la pièce que la base désigne.
    const { repo, trace } = doubles({ draft: draftMandate() });
    const handler = new AttachMandateProofHandler(
      repo,
      tracingStore(trace),
      CIPHER,
      new FixedClock(NOW),
    );

    await handler.execute(new AttachMandateProofCommand("cmp_1", "mandat.pdf", PDF));

    expect(trace.stored?.key).toBe(`companies/cmp_1/mandates/mdt_1/mandat-signe-${NOW.getTime()}`);
    // 🔴 `octet-stream` et non `application/pdf` depuis le 2026-09-12 : ce qui
    // est rangé n'EST plus un PDF.
    expect(trace.stored?.document.contentType).toBe("application/octet-stream");
  });

  it("ne recouvre jamais le dépôt précédent", async () => {
    const draft = draftMandate();
    const keys: string[] = [];
    for (const at of [NOW, new Date(NOW.getTime() + 60_000)]) {
      const { repo, trace } = doubles({ draft });
      const handler = new AttachMandateProofHandler(
        repo,
        tracingStore(trace),
        CIPHER,
        new FixedClock(at),
      );
      await handler.execute(new AttachMandateProofCommand("cmp_1", "mandat.pdf", PDF));
      keys.push(trace.stored?.key ?? "");
    }

    expect(keys[0]).not.toBe(keys[1]);
    expect(draft.proofStorageKey()).toBe(keys[1]);
  });

  /**
   * 🔴 Régression : le scan du mandat SIGNÉ partait en clair dans le bucket,
   * alors que les mêmes données — nom, banque, IBAN — étaient scellées en
   * colonne. C'est la pièce qui porte en plus une signature manuscrite.
   */
  it("scelle les octets — le bucket ne voit jamais la pièce", async () => {
    const { repo, trace } = doubles({ draft: draftMandate() });
    const handler = new AttachMandateProofHandler(
      repo,
      tracingStore(trace),
      CIPHER,
      new FixedClock(NOW),
    );

    await handler.execute(new AttachMandateProofCommand("cmp_1", "mandat.pdf", PDF));

    const stored = trace.stored?.document.bytes;
    expect(stored?.equals(PDF)).toBe(false);
    expect(CIPHER.openBytes(stored!).equals(PDF)).toBe(true);
  });

  it("refuse une pièce dont les octets ne sont pas une pièce", async () => {
    const { repo, trace } = doubles({ draft: draftMandate() });
    const handler = new AttachMandateProofHandler(
      repo,
      tracingStore(trace),
      CIPHER,
      new FixedClock(NOW),
    );

    await expect(
      handler.execute(
        new AttachMandateProofCommand("cmp_1", "mandat.pdf", Buffer.from("MZ\x90\x00", "latin1")),
      ),
    ).rejects.toThrow(/Pièce invalide/u);
    expect(trace.stored).toBeNull();
  });
});
