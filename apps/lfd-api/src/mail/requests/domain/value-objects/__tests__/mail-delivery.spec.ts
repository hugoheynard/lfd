import { deliveryKindOf, deliveryOutranks, mailDeliveryOf } from "../mail-delivery.js";

describe("deliveryKindOf — le genre, jamais le texte (décision 4)", () => {
  it.each([
    ["Permanent", "General", "Permanent/General"],
    ["Transient", "MailboxFull", "Transient/MailboxFull"],
    ["Undetermined", null, "Undetermined"],
  ])("%s + %s → %s", (type, subType, kind) => {
    expect(deliveryKindOf(type, subType)).toBe(kind);
  });

  it("écarte un genre qui n'est pas fait que de lettres", () => {
    expect(deliveryKindOf("x@y.fr", null)).toBeNull();
    expect(deliveryKindOf("Permanent rejected", null)).toBeNull();
    expect(deliveryKindOf(null, "General")).toBeNull();
  });

  it("garde le genre et écarte un sous-genre illisible", () => {
    expect(deliveryKindOf("Permanent", "a b@c")).toBe("Permanent");
  });

  it("écarte un mot trop long", () => {
    expect(deliveryKindOf("A".repeat(31), null)).toBeNull();
  });
});

describe("le rang des retours", () => {
  it("tout retour relève l'absence de retour", () => {
    expect(deliveryOutranks("delayed", null)).toBe(true);
  });

  it("delayed < delivered < complained < bounced", () => {
    expect(deliveryOutranks("delivered", "delayed")).toBe(true);
    expect(deliveryOutranks("complained", "delivered")).toBe(true);
    expect(deliveryOutranks("bounced", "complained")).toBe(true);
    expect(deliveryOutranks("delivered", "bounced")).toBe(false);
    expect(deliveryOutranks("bounced", "bounced")).toBe(false);
  });

  it("relit une valeur connue, et rien d'autre", () => {
    expect(mailDeliveryOf("bounced")).toBe("bounced");
    expect(mailDeliveryOf("sent")).toBeNull();
  });
});
