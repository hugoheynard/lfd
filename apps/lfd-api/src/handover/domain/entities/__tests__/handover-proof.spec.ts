import { HandoverRefusedError } from "../../errors/handover-errors.js";
import { HandoverProof, type HandoverProofState } from "../handover-proof.js";

function state(overrides: Partial<HandoverProofState> = {}): HandoverProofState {
  return {
    orderId: "ord_1",
    receiverName: "Mme Durand",
    photoKey: "handover/proofs/p_1/photo",
    signatureKey: null,
    signedSlipKey: null,
    recordedBy: "staff_paul",
    recordedAt: new Date(1_000),
    ...overrides,
  };
}

describe("HandoverProof — les pièces d'une remise à la porte (B1, L6-C9)", () => {
  it("joint la photo et, s'il y en a une, la signature", () => {
    const proof = HandoverProof.attach(state({ signatureKey: "handover/proofs/p_1/signature" }));

    expect(proof.state.signatureKey).toBe("handover/proofs/p_1/signature");
  });

  it("refuse une clé d'image vide, et une pièce sans auteur", () => {
    expect(() => HandoverProof.attach(state({ photoKey: "" }))).toThrow(HandoverRefusedError);
    expect(() => HandoverProof.attach(state({ signatureKey: "" }))).toThrow(HandoverRefusedError);
    expect(() => HandoverProof.attach(state({ recordedBy: "" }))).toThrow(HandoverRefusedError);
  });
});

describe("HandoverProof.imageKeys — ce qu'un effacement retire du stockage", () => {
  it("rend la photo seule, sans signature", () => {
    expect(HandoverProof.rehydrate(state()).imageKeys()).toEqual(["handover/proofs/p_1/photo"]);
  });

  it("rend la photo puis la signature", () => {
    const proof = HandoverProof.rehydrate(state({ signatureKey: "handover/proofs/p_1/signature" }));
    expect(proof.imageKeys()).toEqual([
      "handover/proofs/p_1/photo",
      "handover/proofs/p_1/signature",
    ]);
  });
});

describe("HandoverProof — la photo du bon signé (signedSlipKey)", () => {
  // Trois états d'une absence : `null` = pas de bon (sans signature exigée, ou
  // d'avant) · `""` = une clé vide, refusée · une clé = rangée.
  it("accepte l'absence de bon (null) et une clé posée, refuse la clé vide", () => {
    expect(() => HandoverProof.attach(state({ signedSlipKey: null }))).not.toThrow();
    expect(() =>
      HandoverProof.attach(state({ signedSlipKey: "handover/proofs/p_1/slip" })),
    ).not.toThrow();
    expect(() => HandoverProof.attach(state({ signedSlipKey: "" }))).toThrow(HandoverRefusedError);
  });

  // Une image oubliée ici resterait au stockage après l'effacement de la ligne,
  // seule à en garder la clé.
  it("rend le bon signé dans les images à effacer, après photo et signature", () => {
    const proof = HandoverProof.rehydrate(state({ signatureKey: "sig", signedSlipKey: "slip" }));
    expect(proof.imageKeys()).toEqual(["handover/proofs/p_1/photo", "sig", "slip"]);
  });

  it("rend le bon signé même sans signature dessinée", () => {
    const proof = HandoverProof.rehydrate(state({ signedSlipKey: "slip" }));
    expect(proof.imageKeys()).toEqual(["handover/proofs/p_1/photo", "slip"]);
  });
});
