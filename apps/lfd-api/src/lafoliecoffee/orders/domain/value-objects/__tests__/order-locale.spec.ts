import { UnknownOrderLocaleError } from "../../errors/order-locale-errors.js";
import { OrderLocale } from "../order-locale.js";

describe("OrderLocale — la langue de la commande", () => {
  it.each(["fr", "en", "it"])("accepte « %s », une langue de la boutique", (raw) => {
    expect(OrderLocale.of(raw).code).toBe(raw);
  });

  it.each(["de", "FR", "", " en", "en-GB"])("refuse « %s », qui n'en est pas une", (raw) => {
    expect(() => OrderLocale.of(raw)).toThrow(UnknownOrderLocaleError);
  });

  it("rend null quand la boutique n'a rien envoyé — jamais un « fr » inventé", () => {
    expect(OrderLocale.ofOptional(undefined)).toBeNull();
  });

  it("valide la langue envoyée", () => {
    expect(OrderLocale.ofOptional("it")?.code).toBe("it");
    expect(() => OrderLocale.ofOptional("es")).toThrow(UnknownOrderLocaleError);
  });
});
