import type { AcceptedMember } from "../../../account/domain/ports/accepted-members.reader.js";
import {
  chargedToPrincipal,
  noticeRecipients,
  principalStillWritten,
} from "../notice-recipients.js";

const member = (userId: string, role: AcceptedMember["role"] = "owner"): AcceptedMember => ({
  userId,
  email: `${userId}@alpes.test`,
  role,
});

describe("principalStillWritten (Q2)", () => {
  it("prévient un principal actif, en attente ou suspendu", () => {
    expect(principalStillWritten("active")).toBe(true);
    expect(principalStillWritten("pending")).toBe(true);
    expect(principalStillWritten("suspended")).toBe(true);
  });

  it("ne prévient ni un principal résilié, ni un principal disparu", () => {
    expect(principalStillWritten("terminated")).toBe(false);
    expect(principalStillWritten(null)).toBe(false);
  });
});

describe("noticeRecipients (§2)", () => {
  it("retire l'auteur du geste, même membre du principal", () => {
    expect(noticeRecipients([member("u1"), member("author")], "author")).toEqual([member("u1")]);
  });

  it("garde tout le monde quand personne côté client n'a agi", () => {
    expect(noticeRecipients([member("u1"), member("u2")], null)).toHaveLength(2);
  });

  it("n'écrit qu'une fois à une personne", () => {
    expect(noticeRecipients([member("u1", "owner"), member("u1", "admin")], null)).toEqual([
      member("u1", "owner"),
    ]);
  });
});

describe("chargedToPrincipal (§1)", () => {
  it("vrai seulement quand le payeur copié est le principal", () => {
    expect(chargedToPrincipal("alpes", "alpes")).toBe(true);
    expect(chargedToPrincipal("chalet", "alpes")).toBe(false);
    expect(chargedToPrincipal(null, "alpes")).toBe(false);
  });
});
