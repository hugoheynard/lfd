import {
  closeStopWithoutHandoverPayloadSchema,
  declareStopArrivalPayloadSchema,
  depositStopFieldsSchema,
  handOverStopFieldsSchema,
} from "../delivery-doorstep.js";

/**
 * La position au geste (`gps-y-aller-et-position.md`, YA-D4) : facultative,
 * les trois champs ensemble, bornée — et lue en chaîne dans un multipart.
 */
describe("la position facultative des gestes qui closent un arrêt", () => {
  it("un geste sans position reste valide", () => {
    expect(closeStopWithoutHandoverPayloadSchema.parse({ version: 3 })).toEqual({ version: 3 });
    expect(depositStopFieldsSchema.parse({ version: "3" })).toEqual({ version: 3 });
  });

  it("lit la position en chaînes, comme un champ de formulaire", () => {
    expect(
      handOverStopFieldsSchema.parse({
        version: "2",
        receiverName: "Mme Durand",
        positionLat: "45.46",
        positionLng: "6.9",
        positionAccuracyM: "12.5",
      }),
    ).toEqual({
      version: 2,
      receiverName: "Mme Durand",
      positionLat: 45.46,
      positionLng: 6.9,
      positionAccuracyM: 12.5,
    });
  });

  it("refuse une position incomplète", () => {
    expect(
      closeStopWithoutHandoverPayloadSchema.safeParse({
        version: 1,
        positionLat: 45,
        positionLng: 6,
      }).success,
    ).toBe(false);
  });

  it.each([
    { positionLat: 91, positionLng: 6, positionAccuracyM: 10 },
    { positionLat: 45, positionLng: -181, positionAccuracyM: 10 },
    { positionLat: 45, positionLng: 6, positionAccuracyM: -1 },
    { positionLat: "abc", positionLng: 6, positionAccuracyM: 10 },
  ])("refuse une position hors bornes : %o", (position) => {
    expect(depositStopFieldsSchema.safeParse({ version: 1, ...position }).success).toBe(false);
  });
});

describe("« Je suis arrivé » : le corps reste facultatif", () => {
  it("accepte l'absence de corps, comme avant la position", () => {
    expect(declareStopArrivalPayloadSchema.parse(undefined)).toEqual({});
    expect(declareStopArrivalPayloadSchema.parse(null)).toEqual({});
  });
});
