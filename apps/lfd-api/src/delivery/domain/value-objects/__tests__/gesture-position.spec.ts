import { GesturePositionInvalidError } from "../../errors/gesture-position-errors.js";
import { GesturePosition } from "../gesture-position.js";

describe("GesturePosition — la position du téléphone au geste (YA-D4)", () => {
  it("garde un relevé terrestre, précision comprise", () => {
    const position = GesturePosition.take({ lat: 45.46, lng: 6.9, accuracyM: 0 });

    expect([position.lat, position.lng, position.accuracyM]).toEqual([45.46, 6.9, 0]);
  });

  it.each([
    { lat: 91, lng: 6, accuracyM: 10 },
    { lat: 45, lng: 181, accuracyM: 10 },
    { lat: Number.NaN, lng: 6, accuracyM: 10 },
    { lat: 45, lng: 6, accuracyM: -1 },
    { lat: 45, lng: 6, accuracyM: Number.POSITIVE_INFINITY },
  ])("refuse un relevé impossible : %o", (input) => {
    expect(() => GesturePosition.take(input)).toThrow(GesturePositionInvalidError);
  });
});
