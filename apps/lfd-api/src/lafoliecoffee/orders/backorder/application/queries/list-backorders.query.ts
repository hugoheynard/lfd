import type { BackorderListFilter } from "../../domain/ports/backorder-list.reader.js";

/** **La liste des reliquats**, vue de l'équipe : un état, une société ou toutes. */
export class ListBackordersQuery {
  constructor(readonly filter: BackorderListFilter) {}
}
