import { Buffer } from "node:buffer";

import { AesGcmFieldCipher } from "../../../../../platform/crypto/aes-gcm-field-cipher.js";
import type { DocumentStore } from "../../../../../platform/storage/document-store.js";
import { MandateNotFoundError } from "../../../domain/errors/mandate-errors.js";
import { PaymentMandate } from "../../../domain/entities/payment-mandate.js";
import type { PaymentMandateRepository } from "../../../domain/payment-mandate.repository.js";
import { GetMandateProofHandler } from "../get-mandate-proof.handler.js";
import { GetMandateProofQuery } from "../get-mandate-proof.query.js";

const CIPHER = new AesGcmFieldCipher(Buffer.alloc(32, 11));
const PDF = Buffer.from("%PDF-1.4\nmandat signé", "latin1");

function mandate(proof: { key: string; name: string } | null): PaymentMandate {
  return PaymentMandate.reconstitute({
    scheme: "B2B",
    paymentType: "recurrent",
    id: "mdt_1",
    companyId: "cmp_1",
    stripeCustomerId: null,
    paymentMethodId: null,
    reference: "LFC-9P2X4B-260912-K7M3QT",
    last4: "3000",
    bankCode: "",
    country: "FR",
    status: "active",
    acceptedAt: new Date("2026-09-03T00:00:00.000Z"),
    revokedAt: null,
    proofStorageKey: proof?.key ?? null,
    proofFileName: proof?.name ?? null,
    creditorId: "ent_1",
  });
}

function build(options: {
  readonly current: PaymentMandate | null;
  readonly stored?: Buffer | null;
}) {
  const mandates: PaymentMandateRepository = {
    // 🔴 `findCurrent` rend un AUTRE mandat : la pièce se lit par identifiant
    // depuis le 2026-09-14, et un handler qui retomberait sur le courant rougirait.
    findCurrent: () => Promise.resolve(null),
    findById: () => Promise.resolve(options.current),
    findDraft: () => Promise.resolve(null),
    findAwaitingProof: () => Promise.resolve(null),
    create: () => Promise.resolve("x"),
    save: () => Promise.resolve(),
    findHolder: () => Promise.resolve(null),
    findStripeCustomerId: () => Promise.resolve(null),
    depositProof: () => Promise.resolve(),
  };
  const store: DocumentStore = {
    save: (key) => Promise.resolve(key),
    read: () => Promise.resolve(Buffer.alloc(0)),
    readIfPresent: () => Promise.resolve(options.stored ?? null),
    delete: () => Promise.resolve(),
  };
  return new GetMandateProofHandler(mandates, store, CIPHER);
}

describe("GetMandateProofHandler — ressortir la preuve", () => {
  /**
   * 🔴 LE test de ce fichier. La pièce entrait sans jamais pouvoir ressortir :
   * `proofStorageKey` n'avait aucun appelant de production. Une preuve qu'on ne
   * sait pas produire ne prouve rien au moment où l'on en a besoin.
   */
  it("descelle la pièce et rend les octets d'origine", async () => {
    const handler = build({
      current: mandate({ key: "k", name: "mandat.pdf" }),
      stored: CIPHER.sealBytes(PDF),
    });

    const proof = await handler.execute(new GetMandateProofQuery("cmp_1", "mdt_1"));

    expect(proof?.bytes.equals(PDF)).toBe(true);
    expect(proof?.fileName).toBe("mandat.pdf");
  });

  /**
   * Le type n'est porté par aucune colonne, et le stockage annonce désormais
   * `octet-stream` — ce qui est rangé n'est pas un PDF. Il se relit dans les
   * octets descellés, par le value object qui les a validés à l'entrée.
   */
  it("retrouve le type réel dans les octets, pas dans une colonne", async () => {
    const handler = build({
      current: mandate({ key: "k", name: "mandat.pdf" }),
      stored: CIPHER.sealBytes(PDF),
    });

    expect((await handler.execute(new GetMandateProofQuery("cmp_1", "mdt_1")))?.contentType).toBe(
      "application/pdf",
    );
  });

  it("rend null quand aucune pièce n'est déposée — un état normal, pas une panne", async () => {
    const handler = build({ current: mandate(null) });

    expect(await handler.execute(new GetMandateProofQuery("cmp_1", "mdt_1"))).toBeNull();
  });

  /**
   * Le couple « la base annonce une pièce, le bucket ne l'a pas » — rencontré
   * pour de vrai sur un logo le 2026-09-12. Servi comme une absence : le geste
   * de sortie est le même, redéposer.
   */
  it("rend null quand la base annonce une pièce que le bucket n'a pas", async () => {
    const handler = build({ current: mandate({ key: "k", name: "mandat.pdf" }), stored: null });

    expect(await handler.execute(new GetMandateProofQuery("cmp_1", "mdt_1"))).toBeNull();
  });

  /**
   * 🔴 Le mur tenant : la pièce se lit par identifiant, donc un identifiant
   * deviné ne doit pas suffire à lire celle d'un autre client.
   */
  it("refuse la pièce d'un mandat qui appartient à une autre société", async () => {
    const handler = build({
      current: mandate({ key: "k", name: "mandat.pdf" }),
      stored: CIPHER.sealBytes(PDF),
    });

    await expect(handler.execute(new GetMandateProofQuery("cmp_autre", "mdt_1"))).rejects.toThrow(
      MandateNotFoundError,
    );
  });

  it("refuse un identifiant de mandat inconnu", async () => {
    const handler = build({ current: null });

    await expect(handler.execute(new GetMandateProofQuery("cmp_x", "mdt_x"))).rejects.toThrow(
      MandateNotFoundError,
    );
  });
});
