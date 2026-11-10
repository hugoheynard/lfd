import { truncateIp } from "../truncate-ip.js";

describe("truncateIp — le réseau, jamais l'hôte", () => {
  it("IPv4 : trois octets", () => {
    expect(truncateIp("203.0.113.42")).toBe("203.0.113.x");
  });

  it("IPv6 : trois groupes", () => {
    expect(truncateIp("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3::x");
  });

  it("une valeur inconnue ne s'écrit pas telle quelle", () => {
    expect(truncateIp("unknown")).toBe("inconnue");
  });
});
