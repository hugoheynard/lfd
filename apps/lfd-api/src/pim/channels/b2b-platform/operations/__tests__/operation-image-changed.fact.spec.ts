import {
  OperationImageChangedFact,
  OperationImageChangedPayloadError,
  PIM_OPERATION_IMAGE_CHANGED,
} from "../operation-image-changed.fact.js";

const IMAGE = { url: "https://m.test/b.jpg", alt: "Une bûche", focal: { x: 0.2, y: 0.9 } };

describe("OperationImageChangedFact", () => {
  it("fait l'aller-retour par la boîte d'envoi, clé unique par geste", () => {
    const fact = new OperationImageChangedFact("noel", "g_1", IMAGE).durableFact();

    expect(fact.type).toBe(PIM_OPERATION_IMAGE_CHANGED);
    expect(fact.key).toBe(`${PIM_OPERATION_IMAGE_CHANGED}:noel:g_1`);
    expect(OperationImageChangedFact.fromPayload(fact.payload)).toEqual(
      new OperationImageChangedFact("noel", "g_1", IMAGE),
    );
  });

  it("relit une image absente, et un point absent comme « au centre »", () => {
    expect(
      OperationImageChangedFact.fromPayload({ operationKey: "noel", gestureId: "g", image: null })
        .image,
    ).toBeNull();
    expect(
      OperationImageChangedFact.fromPayload({
        operationKey: "noel",
        gestureId: "g",
        image: { url: IMAGE.url, alt: "" },
      }).image,
    ).toEqual({ url: IMAGE.url, alt: "", focal: null });
  });

  it.each([
    ["sans clé", { gestureId: "g", image: null }],
    ["sans geste", { operationKey: "noel", image: null }],
    ["image sans URL", { operationKey: "noel", gestureId: "g", image: { url: "", alt: "" } }],
    ["image sans alternative", { operationKey: "noel", gestureId: "g", image: { url: "u" } }],
    [
      "point hors de [0,1]",
      { operationKey: "noel", gestureId: "g", image: { url: "u", alt: "", focal: { x: 2, y: 0 } } },
    ],
    ["image absente du payload", { operationKey: "noel", gestureId: "g" }],
  ])("refuse un payload %s", (_case, payload) => {
    expect(() => OperationImageChangedFact.fromPayload(payload)).toThrow(
      OperationImageChangedPayloadError,
    );
  });
});
