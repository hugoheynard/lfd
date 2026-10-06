import { DriverNoticeAcknowledgement } from "../driver-notice-acknowledgement.js";
import {
  DriverNoticeOutdatedError,
  DriverNoticeWithoutStaffError,
} from "../../errors/driver-notice-errors.js";
import type { DriverInformationNotice } from "../../value-objects/driver-information-notice.js";

const NOTICE: DriverInformationNotice = { version: 3, title: "t", intro: "i", sections: [] };
const AT = new Date(0);

describe("DriverNoticeAcknowledgement.acknowledge (« J'ai compris »)", () => {
  it("accuse la version courante, à l'instant donné, pour la fiche donnée", () => {
    const ack = DriverNoticeAcknowledgement.acknowledge({
      staffUserId: "st_paul",
      readVersion: 3,
      current: NOTICE,
      at: AT,
    });

    expect(ack).toMatchObject({ staffUserId: "st_paul", version: 3, acknowledgedAt: AT });
  });

  it("refuse une version périmée : on ne date pas la lecture d'un texte non vu", () => {
    const outdated = () =>
      DriverNoticeAcknowledgement.acknowledge({
        staffUserId: "st_paul",
        readVersion: 2,
        current: NOTICE,
        at: AT,
      });

    expect(outdated).toThrow(DriverNoticeOutdatedError);
  });

  it("refuse une version future, qui n'existe pas encore", () => {
    expect(() =>
      DriverNoticeAcknowledgement.acknowledge({
        staffUserId: "st_paul",
        readVersion: 4,
        current: NOTICE,
        at: AT,
      }),
    ).toThrow(DriverNoticeOutdatedError);
  });

  it("refuse un accusé sans fiche staff", () => {
    expect(() =>
      DriverNoticeAcknowledgement.acknowledge({
        staffUserId: "  ",
        readVersion: 3,
        current: NOTICE,
        at: AT,
      }),
    ).toThrow(DriverNoticeWithoutStaffError);
  });
});
