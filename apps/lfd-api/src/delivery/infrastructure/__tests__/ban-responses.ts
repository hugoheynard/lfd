/**
 * Réponses de `/search/csv/` de la Base Adresse Nationale — les colonnes
 * envoyées, puis les colonnes de résultat demandées
 * (`result_columns=latitude,longitude,result_score`). Aucun appel réseau en
 * test.
 *
 * Les lignes 0, 2 et 3 sont ENREGISTRÉES : rendues par
 * `api-adresse.data.gouv.fr` le 2026-09-29 à la requête que forme
 * `BanGeocoder`, sur des adresses publiques (une rue, la place d'une mairie,
 * une adresse inventée). La ligne 1 est CONSTRUITE, pour éprouver un champ
 * entre guillemets — la BAN recopie les champs envoyés tels quels.
 */
export const BAN_MIXED = [
  "row,street,postcode,city,latitude,longitude,result_score",
  "0,12 Rue de Boigne,73000,Chambéry,45.565378,5.920472,0.9690854545454544",
  '1,"Place de l\'Hôtel de Ville, bâtiment ""B""",73200,Albertville,45.675961,6.392458,0.8121',
  "2,Place de la Mairie,73000,Chambéry,45.576911,5.927794,0.48935566844919776",
  "3,Nulle part,00000,Inconnue,,,",
  "",
].join("\n");

/** Une page d'erreur HTML servie avec un 200 par un intermédiaire. */
export const BAN_NOT_CSV = "<html><body>Service Unavailable</body></html>";
