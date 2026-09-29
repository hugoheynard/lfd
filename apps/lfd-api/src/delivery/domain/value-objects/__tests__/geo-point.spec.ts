import { InvalidGeoPointError } from "../../errors/delivery-routing-errors.js";
import { geoPoint } from "../geo-point.js";

describe("un point GPS", () => {
  it("garde un point dans les bornes", () => {
    expect(geoPoint(45.56, 5.92)).toEqual({ lat: 45.56, lng: 5.92 });
  });

  it.each([
    [91, 0],
    [0, -181],
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
  ])("refuse (%s, %s)", (lat, lng) => {
    expect(() => geoPoint(lat, lng)).toThrow(InvalidGeoPointError);
  });
});
