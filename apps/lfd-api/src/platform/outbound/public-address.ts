import { BlockList, isIP } from "node:net";

/** Pourquoi une adresse est refusée : dit à l'écran, sans jargon de RFC. */
export type ClosedAddressReason =
  "loopback" | "private" | "link-local" | "metadata" | "reserved" | "not-an-address";

export type AddressVerdict =
  { readonly open: true } | { readonly open: false; readonly reason: ClosedAddressReason };

interface Range {
  readonly network: string;
  readonly prefix: number;
  readonly family: "ipv4" | "ipv6";
  readonly reason: ClosedAddressReason;
}

/**
 * Les plages qu'un webhook sortant ne vise JAMAIS (S2). L'ordre compte : la
 * première qui contient l'adresse donne la raison — l'adresse de métadonnées
 * des nuages avant le lien local qui la contient.
 */
const CLOSED_RANGES: readonly Range[] = [
  { network: "169.254.169.254", prefix: 32, family: "ipv4", reason: "metadata" },
  { network: "100.100.100.200", prefix: 32, family: "ipv4", reason: "metadata" },
  { network: "fd00:ec2::254", prefix: 128, family: "ipv6", reason: "metadata" },
  { network: "127.0.0.0", prefix: 8, family: "ipv4", reason: "loopback" },
  { network: "::1", prefix: 128, family: "ipv6", reason: "loopback" },
  { network: "169.254.0.0", prefix: 16, family: "ipv4", reason: "link-local" },
  { network: "fe80::", prefix: 10, family: "ipv6", reason: "link-local" },
  { network: "10.0.0.0", prefix: 8, family: "ipv4", reason: "private" },
  { network: "172.16.0.0", prefix: 12, family: "ipv4", reason: "private" },
  { network: "192.168.0.0", prefix: 16, family: "ipv4", reason: "private" },
  { network: "100.64.0.0", prefix: 10, family: "ipv4", reason: "private" },
  { network: "fc00::", prefix: 7, family: "ipv6", reason: "private" },
  { network: "0.0.0.0", prefix: 8, family: "ipv4", reason: "reserved" },
  { network: "192.0.0.0", prefix: 24, family: "ipv4", reason: "reserved" },
  { network: "192.0.2.0", prefix: 24, family: "ipv4", reason: "reserved" },
  { network: "198.18.0.0", prefix: 15, family: "ipv4", reason: "reserved" },
  { network: "198.51.100.0", prefix: 24, family: "ipv4", reason: "reserved" },
  { network: "203.0.113.0", prefix: 24, family: "ipv4", reason: "reserved" },
  { network: "224.0.0.0", prefix: 4, family: "ipv4", reason: "reserved" },
  { network: "240.0.0.0", prefix: 4, family: "ipv4", reason: "reserved" },
  { network: "::", prefix: 128, family: "ipv6", reason: "reserved" },
  // Les formes qui EMBARQUENT une IPv4 (mappée, NAT64, 6to4) : refusées en
  // bloc plutôt que décodées — aucun abonné légitime ne s'y trouve, et un
  // décodage incomplet serait exactement le trou qu'on ferme.
  { network: "::ffff:0:0", prefix: 96, family: "ipv6", reason: "reserved" },
  { network: "64:ff9b::", prefix: 96, family: "ipv6", reason: "reserved" },
  { network: "2002::", prefix: 16, family: "ipv6", reason: "reserved" },
  { network: "2001:db8::", prefix: 32, family: "ipv6", reason: "reserved" },
  { network: "ff00::", prefix: 8, family: "ipv6", reason: "reserved" },
];

const LISTS: readonly { readonly list: BlockList; readonly range: Range }[] = CLOSED_RANGES.map(
  (range) => {
    const list = new BlockList();
    list.addSubnet(range.network, range.prefix, range.family);
    return { list, range };
  },
);

/**
 * **L'adresse est-elle ouverte à un webhook sortant ?** Refuse le bouclage,
 * les réseaux privés, le lien local, les métadonnées des nuages et les plages
 * réservées. Lue sur l'adresse RÉSOLUE, jamais sur le nom : un nom public
 * peut pointer n'importe où.
 */
export function classifyAddress(address: string): AddressVerdict {
  const version = isIP(address);
  if (version === 0) {
    return { open: false, reason: "not-an-address" };
  }
  const family = version === 4 ? "ipv4" : "ipv6";
  const closed = LISTS.find(
    ({ list, range }) => range.family === family && list.check(address, family),
  );
  return closed === undefined ? { open: true } : { open: false, reason: closed.range.reason };
}

/** Le mot de l'écran pour chaque raison. */
export const CLOSED_ADDRESS_LABELS: Readonly<Record<ClosedAddressReason, string>> = {
  loopback: "une adresse de bouclage (cette machine)",
  private: "une adresse de réseau privé",
  "link-local": "une adresse de lien local",
  metadata: "l'adresse des métadonnées d'un hébergeur",
  reserved: "une adresse réservée",
  "not-an-address": "une adresse illisible",
};
