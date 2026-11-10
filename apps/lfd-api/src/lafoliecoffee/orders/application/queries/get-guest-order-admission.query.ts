/** Query : une commande sans compte, à CETTE adresse, serait-elle prise (2026-10-26) ? */
export class GetGuestOrderAdmissionQuery {
  constructor(readonly email: string) {}
}
