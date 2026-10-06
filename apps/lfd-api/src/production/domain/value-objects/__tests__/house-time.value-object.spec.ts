import { InvalidHouseTimeError } from "../../errors/production-settings-errors.js";
import { HouseTime } from "../house-time.value-object.js";

describe("HouseTime — une heure de la maison", () => {
  it("lit HH:MM en minutes depuis minuit", () => {
    expect(HouseTime.of("20:30", "alert").minutes).toBe(20 * 60 + 30);
    expect(HouseTime.of(" 00:00 ", "close").value).toBe("00:00");
  });

  it.each(["24:00", "7:30", "20h30", "", "12:60", "abc"])("refuse « %s »", (raw) => {
    expect(() => HouseTime.of(raw, "close")).toThrow(InvalidHouseTimeError);
  });

  it("nomme l'heure qu'il refuse et la forme attendue", () => {
    expect(() => HouseTime.of("20h", "alert")).toThrow(
      "L'heure d'alerte « 20h » n'est pas une heure : saisissez-la au format HH:MM, entre 00:00 et 23:59.",
    );
  });

  it("ramène un nombre de minutes dans la journée", () => {
    expect(HouseTime.fromMinutes(25 * 60 + 5).value).toBe("01:05");
    expect(HouseTime.fromMinutes(-30).value).toBe("23:30");
  });
});
