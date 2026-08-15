/**
 * La liste des pays, pour le champ « Pays ».
 *
 * Les **noms** sont calculés par `Intl.DisplayNames` à partir des codes ISO
 * 3166-1 alpha-2 : les traduire à la main, c'est 240 chaînes à maintenir, et
 * une localisation de moins à chaque nouvelle langue.
 *
 * La **valeur stockée est le nom**, pas le code. Ce n'est pas le meilleur
 * modèle dans l'absolu — un code est stable, un nom dépend de la langue — mais
 * c'est ce que la base contient déjà (« France »), et sur une adresse postale
 * ce qu'on imprime sur le colis est justement le nom. Le jour où un pays doit
 * être *comparé* (TVA, zone, transporteur), c'est un code qu'il faudra, et ce
 * jour-là la migration est un `UPDATE` — pas un piège silencieux.
 *
 * Les territoires inhabités (Antarctique, îles Heard…) sont écartés : personne
 * n'y reçoit de pain.
 */
const ALPHA2 =
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK ' +
  'FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS ' +
  'IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ' +
  'ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL ' +
  'PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC ' +
  'TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

export interface CountryOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Les pays, nommés dans `locale`, triés dans cette même langue. Un code que
 * l'environnement ne sait pas nommer est écarté plutôt qu'affiché tel quel.
 */
export function countryOptions(locale = 'fr'): readonly CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const collator = new Intl.Collator(locale);
  return ALPHA2.split(' ')
    .map((code) => names.of(code) ?? code)
    .filter((name) => name.length > 2)
    .map((name) => ({ value: name, label: name }))
    .sort((a, b) => collator.compare(a.label, b.label));
}
