import type { DeliveryProcedureView } from "@lfd/contracts";

import {
  CompanyAddressNotFoundError,
  CompanyNotFoundError,
} from "../../../domain/errors/account-errors.js";
import {
  DeliveryStepPhotoNotFoundError,
  DeliveryStepPhotoUnreadableError,
} from "../../../domain/errors/delivery-procedure-errors.js";
import { DeliveryProcedureReader } from "../../../domain/ports/delivery-procedure.reader.js";
import { DeliveryStepPhotoLocator } from "../../../domain/ports/delivery-step-photo.locator.js";
import {
  ADDRESS,
  COMPANY,
  InMemoryStore,
  addressBook,
  membership,
  pngOf,
} from "../../__tests__/delivery-procedure-doubles.js";
import { GetDeliveryProcedureForStaffHandler } from "../get-delivery-procedure-for-staff.handler.js";
import { GetDeliveryProcedureForStaffQuery } from "../get-delivery-procedure-for-staff.query.js";
import { GetDeliveryProcedureHandler } from "../get-delivery-procedure.handler.js";
import { GetDeliveryProcedureQuery } from "../get-delivery-procedure.query.js";
import { GetDeliveryStepPhotoForStaffHandler } from "../get-delivery-step-photo-for-staff.handler.js";
import { GetDeliveryStepPhotoForStaffQuery } from "../get-delivery-step-photo-for-staff.query.js";
import { GetDeliveryStepPhotoHandler } from "../get-delivery-step-photo.handler.js";
import { GetDeliveryStepPhotoQuery } from "../get-delivery-step-photo.query.js";

/**
 * **Lire la procédure et ses photos.** Tout membre lit ; l'adresse doit être au
 * carnet ; la photo se sert avec le type relu dans ses octets, et des octets qui
 * ne sont pas une image signalent une panne, pas une absence.
 */

const VIEW: DeliveryProcedureView = {
  addressId: ADDRESS,
  steps: [{ id: "s1", number: 1, title: "Portail", body: "", photoRevision: "r1" }],
};

class FixedReader extends DeliveryProcedureReader {
  read(): Promise<DeliveryProcedureView> {
    return Promise.resolve(VIEW);
  }
}

/** Une étape `s1` dont la photo est rangée sous `key-s1`. */
class OneStepLocator extends DeliveryStepPhotoLocator {
  photoKeyOf(companyId: string, addressId: string, stepId: string): Promise<string | null> {
    const known = companyId === COMPANY && addressId === ADDRESS && stepId === "s1";
    return Promise.resolve(known ? "key-s1" : null);
  }
}

function storeWith(bytes: Buffer): InMemoryStore {
  const store = new InMemoryStore([]);
  store.objects.set("key-s1", { bytes, contentType: "ignoré à la relecture" });
  return store;
}

describe("lire la procédure", () => {
  it("la sert à un simple membre", async () => {
    const handler = new GetDeliveryProcedureHandler(
      membership("orders"),
      addressBook([ADDRESS]),
      new FixedReader(),
    );
    await expect(
      handler.execute(new GetDeliveryProcedureQuery("u1", COMPANY, ADDRESS)),
    ).resolves.toEqual(VIEW);
  });

  it("répond 404 à un non-membre", async () => {
    const handler = new GetDeliveryProcedureHandler(
      membership(null),
      addressBook([ADDRESS]),
      new FixedReader(),
    );
    await expect(
      handler.execute(new GetDeliveryProcedureQuery("u1", COMPANY, ADDRESS)),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
  });

  it("répond 404 pour une adresse archivée, côté client comme côté staff", async () => {
    const archived = addressBook([], [ADDRESS]);
    await expect(
      new GetDeliveryProcedureHandler(membership("owner"), archived, new FixedReader()).execute(
        new GetDeliveryProcedureQuery("u1", COMPANY, ADDRESS),
      ),
    ).rejects.toBeInstanceOf(CompanyAddressNotFoundError);
    await expect(
      new GetDeliveryProcedureForStaffHandler(archived, new FixedReader()).execute(
        new GetDeliveryProcedureForStaffQuery(COMPANY, ADDRESS),
      ),
    ).rejects.toBeInstanceOf(CompanyAddressNotFoundError);
  });
});

describe("lire la photo d'une étape", () => {
  it("sert les octets avec le type relu dedans", async () => {
    const png = pngOf(12, 9);
    const handler = new GetDeliveryStepPhotoHandler(
      membership("orders"),
      addressBook([ADDRESS]),
      new OneStepLocator(),
      storeWith(png),
    );
    await expect(
      handler.execute(new GetDeliveryStepPhotoQuery("u1", COMPANY, ADDRESS, "s1")),
    ).resolves.toEqual({ contentType: "image/png", bytes: png });
  });

  it("répond 404 quand l'étape n'a pas de photo", async () => {
    const handler = new GetDeliveryStepPhotoForStaffHandler(
      addressBook([ADDRESS]),
      new OneStepLocator(),
      storeWith(pngOf(1, 1)),
    );
    await expect(
      handler.execute(new GetDeliveryStepPhotoForStaffQuery(COMPANY, ADDRESS, "s2")),
    ).rejects.toBeInstanceOf(DeliveryStepPhotoNotFoundError);
  });

  it("signale une panne quand les octets rangés ne sont pas une image", async () => {
    const handler = new GetDeliveryStepPhotoForStaffHandler(
      addressBook([ADDRESS]),
      new OneStepLocator(),
      storeWith(Buffer.from("%PDF-1.4", "latin1")),
    );
    await expect(
      handler.execute(new GetDeliveryStepPhotoForStaffQuery(COMPANY, ADDRESS, "s1")),
    ).rejects.toBeInstanceOf(DeliveryStepPhotoUnreadableError);
  });
});
