import { CommerceDayVersionReader } from "../../channels/commerce/index.js";
import { InvalidServiceDayError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryDayVersionReader } from "../../domain/ports/delivery-day-version.reader.js";
import { MyRoundDayVersionSource } from "../my-round-day-version.source.js";

class DeliveryVersions extends DeliveryDayVersionReader {
  constructor(private readonly versions: Map<string, number>) {
    super();
  }
  versionOf(serviceDay: string): Promise<number> {
    return Promise.resolve(this.versions.get(serviceDay) ?? 0);
  }
}

class CommerceVersions extends CommerceDayVersionReader {
  readonly asked: string[] = [];
  constructor(private readonly versions: Map<string, number>) {
    super();
  }
  versionOf(day: string): Promise<number> {
    this.asked.push(day);
    return Promise.resolve(this.versions.get(day) ?? 0);
  }
}

// Des jours comparés entre eux seulement : aucune horloge n'est lue.
const DAY = "2030-03-12";

describe("MyRoundDayVersionSource — la version de « ma tournée » (PL4)", () => {
  it("bouge quand la livraison bouge, ET quand le commerce bouge", async () => {
    const delivery = new Map([[DAY, 10]]);
    const commerce = new Map([[DAY, 100]]);
    const source = new MyRoundDayVersionSource(
      new DeliveryVersions(delivery),
      new CommerceVersions(commerce),
    );

    const first = await source.versionOf(DAY);
    delivery.set(DAY, 11); // un bac déclaré
    const second = await source.versionOf(DAY);
    commerce.set(DAY, 140); // une commande prête
    const third = await source.versionOf(DAY);

    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
    expect(third).toBe(151);
  });

  it("refuse un jour absent du calendrier, sans interroger le commerce", async () => {
    const commerce = new CommerceVersions(new Map());
    const source = new MyRoundDayVersionSource(new DeliveryVersions(new Map()), commerce);

    await expect(source.versionOf("2030-02-30")).rejects.toThrow(InvalidServiceDayError);
    expect(commerce.asked).toEqual([]);
  });

  it("se nomme `my-round` et ne s'ouvre qu'à qui conduit", () => {
    const source = new MyRoundDayVersionSource(
      new DeliveryVersions(new Map()),
      new CommerceVersions(new Map()),
    );
    expect(source.journal).toBe("my-round");
    expect(source.readers).toEqual(["delivery_driving:read"]);
  });
});
