/** La liste reçue d'un site pour une journée, avec le stock estimé. */
export class GetResupplyReceiptQuery {
  constructor(
    readonly siteId: string,
    readonly serviceDay: string,
  ) {}
}
