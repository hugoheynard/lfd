/**
 * « Reprendre l'envoi » d'une annonce interrompue : écrire aux seuls
 * destinataires restés « pas tentés ».
 */
export class ResumeVitrineNoticeCommand {
  constructor(readonly noticeId: string) {}
}
