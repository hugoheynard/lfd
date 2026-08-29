import type { ChannelMode } from "@lfd/pim-contracts";

import type { ShopifyChannelMode as PrismaChannelMode } from "../../../../platform/database/client/client.js";

/**
 * La correspondance **base → fil** du mode de canal, et le seul endroit où elle
 * vit.
 *
 * Les deux vocabulaires diffèrent pour une raison qui n'est pas négociable : un
 * enum Postgres ne peut pas porter de tiret, la base écrit donc `dry_run` ; l'API
 * et les écrans échangent `dry-run` depuis toujours. Ce n'est pas une dérive,
 * c'est une frontière — et une frontière mérite une traduction explicite plutôt
 * qu'un ternaire recopié à chaque lecture.
 *
 * 🔴 C'est le ternaire recopié qui a coûté un bug : `/settings` traduisait,
 * l'historique des snapshots rendait la valeur brute, et deux routes de la même
 * API se contredisaient sur la même notion. Le contrat, lui, portait la valeur
 * de la BASE en se présentant comme le fil — et rien ne l'importait, donc rien
 * ne le disait.
 *
 * Le type de cette table est la GARDE : `Record<PrismaChannelMode, …>` refuse de
 * compiler le jour où l'enum Postgres gagne une valeur sans qu'on décide comment
 * elle se dit sur le fil. Là où une égalité de types suffit ailleurs
 * (`company-enum-parity.ts`), il faut ici une exhaustivité — parce que les deux
 * vocabulaires ne se ressemblent pas.
 */
export const CHANNEL_MODE_ON_THE_WIRE: Readonly<Record<PrismaChannelMode, ChannelMode>> = {
  live: "live",
  dry_run: "dry-run",
};
