/**
 * Une IP **tronquée** pour un journal : le réseau, jamais l'hôte. IPv4 garde
 * trois octets (`203.0.113.x`), IPv6 trois groupes (`2001:db8:85a3::x`).
 * Assez pour reconnaître une vague, trop peu pour désigner quelqu'un.
 */
export function truncateIp(ip: string): string {
  if (ip.includes(".")) {
    return `${ip.split(".").slice(0, 3).join(".")}.x`;
  }
  if (ip.includes(":")) {
    return `${ip.split(":").slice(0, 3).join(":")}::x`;
  }
  return "inconnue";
}
