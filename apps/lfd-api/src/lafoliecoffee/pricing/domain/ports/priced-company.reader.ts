/**
 * **La société existe-t-elle ?** — la seule chose que la tarification a besoin
 * de savoir de l'annuaire des comptes.
 *
 * 🔴 **Un port pour un booléen**, et il se justifie par ce qu'il remplace : une
 * query d'application qui injectait `PrismaService` pour interroger la table
 * d'un autre contexte. Le `CLAUDE.md` §4 l'interdit — « le handler dépend de
 * ports, jamais de `PrismaService` » — et §3 rappelle qu'une frontière qu'on ne
 * franchit qu'en Prisma direct est franchie quand même : le graphe d'imports ne
 * la voit pas.
 *
 * Ce qu'il protège tient en une phrase, celle de `PricedCompanyNotFoundError` :
 * une société inconnue ne filtre **rien**, donc la lecture rendrait le catalogue
 * entier au tarif de liste — un écran parfaitement plausible qui affirme « ce
 * client paie le tarif public ». Il n'y a aucun moyen de distinguer ce mensonge
 * d'une vérité, sauf ici.
 */
export abstract class PricedCompanyReader {
  abstract exists(companyId: string): Promise<boolean>;
}
