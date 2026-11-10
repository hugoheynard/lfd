import { InvalidDeliveryStopMinutesError } from "../../errors/account-errors.js";
import {
  DELIVERY_STOP_MINUTES_MAX,
  DELIVERY_STOP_MINUTES_MIN,
  deliveryStopMinutesOf,
} from "../delivery-stop-minutes.js";

describe("le temps de livraison sur place (L7b-C4)", () => {
  it("absent vaut « suit le réglage »", () => {
    expect(deliveryStopMinutesOf(null)).toBeNull();
    expect(deliveryStopMinutesOf(undefined)).toBeNull();
  });

  it("accepte les deux bornes", () => {
    expect(deliveryStopMinutesOf(DELIVERY_STOP_MINUTES_MIN)).toBe(1);
    expect(deliveryStopMinutesOf(DELIVERY_STOP_MINUTES_MAX)).toBe(120);
  });

  it.each([0, 121, 7.5, Number.NaN])("refuse %p", (minutes) => {
    expect(() => deliveryStopMinutesOf(minutes)).toThrow(InvalidDeliveryStopMinutesError);
  });

  it("dit la saisie et le geste de sortie", () => {
    expect(() => deliveryStopMinutesOf(0)).toThrow(
      "Le temps de livraison sur place tient entre 1 et 120 minutes, en minutes entières (saisi : 0). Corrigez-le, ou laissez-le vide pour reprendre le réglage de la livraison.",
    );
  });
});
