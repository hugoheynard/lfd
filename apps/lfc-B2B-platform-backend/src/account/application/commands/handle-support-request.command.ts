/** Marque une demande de contact comme **traitée** (staff). */
export class HandleSupportRequestCommand {
  constructor(readonly supportRequestId: string) {}
}
