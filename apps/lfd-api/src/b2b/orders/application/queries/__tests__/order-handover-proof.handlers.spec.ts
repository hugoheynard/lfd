import {
  type HandoverProofExhibit,
  type HandoverProofPiece,
  HandoverProofReader,
} from "../../../../../handover/channels/commerce/index.js";
import type { StoredDocument } from "../../../../../platform/storage/document-store.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { OrderHandoverProofImageNotFoundError } from "../../../domain/errors/order-handover-proof-errors.js";
import { GetOrderHandoverProofImageHandler } from "../get-order-handover-proof-image.handler.js";
import { GetOrderHandoverProofImageQuery } from "../get-order-handover-proof-image.query.js";
import { GetOrderHandoverProofHandler } from "../get-order-handover-proof.handler.js";
import { GetOrderHandoverProofQuery } from "../get-order-handover-proof.query.js";
import { toOrderHandoverProofView } from "../order-handover-proof-view.js";

const AT = new Date("2026-01-10T09:00:00.000Z");
const PHOTO: StoredDocument = { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: "image/jpeg" };

const HANDED: HandoverProofExhibit = {
  mode: "handed",
  handedOverAt: AT,
  handedOverBy: "stf_paul",
  pieces: { receiverName: "Mme Durand", hasSignature: true },
};

/** Le retrait doublé : une preuve et sa photo pour `ord_1`, rien ailleurs. */
class FixedProofs extends HandoverProofReader {
  readonly askedImages: Array<readonly [string, HandoverProofPiece]> = [];

  constructor(private readonly exhibit: HandoverProofExhibit | null) {
    super();
  }

  ofOrder(orderId: string): Promise<HandoverProofExhibit | null> {
    return Promise.resolve(orderId === "ord_1" ? this.exhibit : null);
  }

  image(orderId: string, piece: HandoverProofPiece): Promise<StoredDocument | null> {
    this.askedImages.push([orderId, piece]);
    return Promise.resolve(orderId === "ord_1" && piece === "photo" ? PHOTO : null);
  }
}

describe("toOrderHandoverProofView", () => {
  it("porte l'instant en ISO et le livreur par son nom, jamais son identifiant", () => {
    const view = toOrderHandoverProofView(HANDED, "Paul Livreur");
    expect(view).toEqual({
      mode: "handed",
      handedOverAt: AT.toISOString(),
      courierName: "Paul Livreur",
      pieces: { receiverName: "Mme Durand", hasSignature: true },
    });
    expect(JSON.stringify(view)).not.toContain("stf_paul");
  });

  it("des pièces effacées restent `null`", () => {
    expect(toOrderHandoverProofView({ ...HANDED, pieces: null }, null).pieces).toBeNull();
  });
});

describe("GetOrderHandoverProofHandler", () => {
  it("nomme le livreur par l'annuaire", async () => {
    const authors = new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Paul", lastName: "Livreur" }, "stf_paul"),
    );
    const response = await new GetOrderHandoverProofHandler(
      new FixedProofs(HANDED),
      authors,
    ).execute(new GetOrderHandoverProofQuery("ord_1"));

    expect(response.proof?.courierName).toBe("Paul Livreur");
    expect(response.proof?.pieces?.receiverName).toBe("Mme Durand");
  });

  it("une fiche staff illisible laisse le livreur sans nom", async () => {
    const response = await new GetOrderHandoverProofHandler(
      new FixedProofs(HANDED),
      new FixedStaffAuthorDirectory(authorsKnownAs({ firstName: "X", lastName: "Y" }, "stf_x")),
    ).execute(new GetOrderHandoverProofQuery("ord_1"));

    expect(response.proof?.courierName).toBeNull();
  });

  it("une commande sans preuve rend `proof: null`, sans interroger l'annuaire", async () => {
    const authors = new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Paul", lastName: "Livreur" }, "stf_paul"),
    );
    const response = await new GetOrderHandoverProofHandler(new FixedProofs(null), authors).execute(
      new GetOrderHandoverProofQuery("ord_1"),
    );

    expect(response).toEqual({ proof: null });
    expect(authors.asked).toHaveLength(0);
  });
});

describe("GetOrderHandoverProofImageHandler", () => {
  it("sert l'image que le retrait retrouve pour cette commande", async () => {
    const proofs = new FixedProofs(HANDED);
    const image = await new GetOrderHandoverProofImageHandler(proofs).execute(
      new GetOrderHandoverProofImageQuery("ord_1", "photo"),
    );

    expect(image).toBe(PHOTO);
    expect(proofs.askedImages).toEqual([["ord_1", "photo"]]);
  });

  it("une pièce absente — autre commande, pas de signature — est un 404", async () => {
    const handler = new GetOrderHandoverProofImageHandler(new FixedProofs(HANDED));

    await expect(
      handler.execute(new GetOrderHandoverProofImageQuery("ord_2", "photo")),
    ).rejects.toBeInstanceOf(OrderHandoverProofImageNotFoundError);
    await expect(
      handler.execute(new GetOrderHandoverProofImageQuery("ord_1", "signature")),
    ).rejects.toBeInstanceOf(OrderHandoverProofImageNotFoundError);
  });
});
