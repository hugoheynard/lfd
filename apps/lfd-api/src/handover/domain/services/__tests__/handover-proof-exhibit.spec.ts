import { HandoverProof } from "../../entities/handover-proof.js";
import { OrderHandover } from "../../entities/order-handover.js";
import type { HandoverVia } from "../handover.js";
import { handoverProofExhibit } from "../handover-proof-exhibit.js";

const AT = new Date("2026-01-10T09:00:00.000Z");

function attested(via: HandoverVia): OrderHandover {
  return OrderHandover.rehydrate("ord_1", "ORD-1", AT, "stf_paul", via);
}

function proof(receiverName: string | null, signatureKey: string | null): HandoverProof {
  return HandoverProof.rehydrate({
    orderId: "ord_1",
    receiverName,
    photoKey: "handover/proofs/x/photo",
    signatureKey,
    recordedBy: "stf_paul",
    recordedAt: AT,
  });
}

describe("handoverProofExhibit", () => {
  it("une remise en main propre montre le nom et annonce la signature", () => {
    expect(
      handoverProofExhibit({
        handover: attested("manual"),
        proof: proof("Mme Durand", "handover/proofs/x/signature"),
        departedWithRound: true,
      }),
    ).toEqual({
      mode: "handed",
      handedOverAt: AT,
      handedOverBy: "stf_paul",
      pieces: { receiverName: "Mme Durand", hasSignature: true },
    });
  });

  it("un dépôt n'a ni nom ni signature", () => {
    expect(
      handoverProofExhibit({
        handover: attested("deposit"),
        proof: proof(null, null),
        departedWithRound: true,
      }),
    ).toMatchObject({ mode: "deposited", pieces: { receiverName: null, hasSignature: false } });
  });

  it("un dépôt sans pièce : la preuve a été effacée", () => {
    expect(
      handoverProofExhibit({
        handover: attested("deposit"),
        proof: null,
        departedWithRound: false,
      }),
    ).toMatchObject({ mode: "deposited", pieces: null });
  });

  it("une remise manuelle d'une commande partie, sans pièce : effacée", () => {
    expect(
      handoverProofExhibit({ handover: attested("manual"), proof: null, departedWithRound: true }),
    ).toMatchObject({ mode: "handed", pieces: null });
  });

  it("un retrait au comptoir — saisi ou scanné — n'a rien à montrer", () => {
    expect(
      handoverProofExhibit({ handover: attested("manual"), proof: null, departedWithRound: false }),
    ).toBeNull();
    expect(
      handoverProofExhibit({ handover: attested("scan"), proof: null, departedWithRound: true }),
    ).toBeNull();
  });
});
