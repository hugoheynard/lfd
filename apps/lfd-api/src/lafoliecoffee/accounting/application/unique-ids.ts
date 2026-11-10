/**
 * Les identifiants sans doublon, dans l'ordre de leur première apparition.
 *
 * Un seul exemplaire pour la constitution des lots, l'émission des factures
 * et les avis de prélèvement : il en existait trois copies (revue du
 * 2026-10-24), et un lecteur qui reçoit deux fois la même société la lit
 * deux fois.
 */
export function unique(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)];
}
