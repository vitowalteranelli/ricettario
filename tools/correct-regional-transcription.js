#!/usr/bin/env node

/*
 * Corregge soltanto errori OCR deterministici nella trascrizione della fonte
 * “Ricette regionali”. Le sostituzioni sono intenzionalmente conservative:
 * parole regionali, quantità illeggibili e casi che richiedono interpretazione
 * restano invariati. Sono incluse solo correzioni contestuali strutturalmente
 * dimostrabili, come parentesi, articoli e unità. Il dataset JSON viene poi
 * rigenerato dall'MD corretto.
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repositoryRoot, 'output', 'cucina-regionale-italiana-5000-ricette.md');
const bodyFirstPage = 13;
const bodyLastPage = 1489;

if (!fs.existsSync(sourcePath)) {
    throw new Error('Trascrizione sorgente non trovata: ' + path.relative(repositoryRoot, sourcePath));
}

const counters = new Map();
const examples = new Map();

function record(rule, before) {
    counters.set(rule, (counters.get(rule) || 0) + 1);
    if (!examples.has(rule)) examples.set(rule, before);
}

function replaceRegex(line, rule, pattern, replacement) {
    return line.replace(pattern, (...args) => {
        const match = args[0];
        record(rule, match);
        if (typeof replacement === 'function') return replacement(...args);
        return replacement;
    });
}

function escapeRegex(value) {
    return value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
}

function replaceToken(line, rule, wrong, right) {
    const pattern = new RegExp(
        '(?<![\\p{L}\\p{N}])' + escapeRegex(wrong) + '(?![\\p{L}\\p{N}-])',
        'gu'
    );
    return replaceRegex(line, rule, pattern, right);
}

function replaceTokens(line, pairs, bodyOnly) {
    if (bodyOnly && (currentPage < bodyFirstPage || currentPage > bodyLastPage)) return line;
    let result = line;
    for (const [wrong, right] of pairs) {
        result = replaceToken(result, 'token: ' + wrong + ' → ' + right, wrong, right);
    }
    return result;
}

function replaceContextualPunctuation(line) {
    if (line.startsWith('<!--')) return line;

    let result = line;
    result = replaceRegex(result, 'punteggiatura OCR: graffe bilanciate → parentesi', /\{([^{}\n]*)\}/gu, (match, content) => '(' + content + ')');
    result = replaceRegex(result, 'punteggiatura OCR: graffa aperta → parentesi', /\{(?=[^{}\n]*\))/gu, '(');
    result = replaceRegex(result, 'punteggiatura OCR: graffa chiusa → parentesi', /(\([^{}\n]*)\}/gu, (match, content) => content + ')');
    return result;
}

const contextualPipePluralNouns = [
    'cavatielli', 'cespi', 'cervella', 'filetti', 'grumi', 'lampascioni',
    'peperoni', 'pezzi', 'pomodori', 'tartufi', 'vini'
];

function replaceContextualPipes(line) {
    if (line.startsWith('<!--')) return line;

    let result = line;
    const pluralNouns = contextualPipePluralNouns.map(escapeRegex).join('|');
    result = replaceRegex(result, 'barra OCR: articolo plurale → i', new RegExp('(?<![\\p{L}\\p{N}])\\| (?=(?:' + pluralNouns + ')(?![\\p{L}\\p{N}-]))', 'gu'), 'i ');
    result = replaceRegex(result, 'barra OCR: articolo singolare → il', /(?<![\p{L}\p{N}])\| (?=pepe(?![\p{L}\p{N}-]))/gu, 'il ');
    result = replaceRegex(result, 'barra OCR: articolo eliso → l’', /\| (?=Alchermes(?![\p{L}\p{N}-]))/gu, 'l’');
    result = replaceRegex(result, 'barra OCR: unità litro prima di quantità', /(?<![\p{L}\p{N}])\|(?=\s+\d+(?:[.,]\d+)?\s+di\b)/gu, 'l');
    result = replaceRegex(result, 'barra OCR: unità litro dopo quantità', /(\b\d+(?:[.,]\d+)?\s+)\|(?=\s+di\b)/gu, (match, prefix) => prefix + 'l');
    result = replaceRegex(result, 'barra OCR: unità litro dopo di', /(\b(?:di|un quarto di|3\/4 di|1\/4 di|un)\s+)\|(?=\s+di\b)/gu, (match, prefix) => prefix + 'l');
    result = replaceRegex(result, 'barra OCR: articolo assente prima di la/massa', /^(\s*)\| (?=(?:la cipolla|massa)(?![\p{L}\p{N}-]))/u, (match, indent) => indent);
    result = replaceRegex(result, 'barra OCR: separatore di intestazione', /^(\s*)\| (?=(?:Ingredienti|VINO CONSIGLIATO|Cervella in insalata)(?:\b|$))/u, (match, indent) => indent);
    result = replaceRegex(result, 'barra OCR: separatore prima della regione', /\s+\|\s+(?=(?:Lazio|Sardegna|Piemonte|Marino|Colli Pesaresi)$)/u, ' ');
    result = replaceRegex(result, 'barra OCR: articolo plurale prima di continuazione', /\bcalate \|$/u, 'calate i');
    result = replaceRegex(result, 'barra OCR: articolo plurale prima di parola spezzata', /\| (?=pepe-(?![\p{L}\p{N}-]))/gu, 'i ');
    result = replaceRegex(result, 'barra OCR: artefatto finale dopo punteggiatura', /([;:]) \|$/u, (match, punctuation) => punctuation);
    result = replaceRegex(result, 'barra OCR: artefatto finale dopo riferimento', /(\d{1,4}) \|$/u, (match, reference) => reference);
    return result;
}

function replaceContextualSquareArtifacts(line) {
    if (line.startsWith('<!--')) return line;

    let result = line;
    result = replaceRegex(result, 'parentesi quadra OCR: articolo il', /(?<![\p{L}\p{N}])(?:1\]|i\]) (?=(?:giorno|frutto|grasso|matterello|polsonetto|sentore|vino)(?![\p{L}\p{N}-]))/gu, 'il ');
    result = replaceRegex(result, 'unità decilitri OCR: parentesi quadra → 1', /\bdl \] di\b/gu, 'dl 1 di');
    result = replaceRegex(result, 'apostrofo OCR in parola spezzata', /\['o-/gu, 'l’o-');
    result = replaceRegex(result, 'parola spezzata OCR: cipo] → cipol', /cipo\]-/gu, 'cipol-');
    return result;
}

function replaceArticleBeforeNouns(line, article, nouns, bodyOnly) {
    if (bodyOnly && (currentPage < bodyFirstPage || currentPage > bodyLastPage)) return line;
    const alternatives = nouns.map(escapeRegex).join('|');
    const pattern = new RegExp(
        '(?<![\\p{L}\\p{N}])' + article
        + ' (?=(?:' + alternatives + ')(?![\\p{L}\\p{N}-]))',
        'gu'
    );
    return replaceRegex(line, 'articolo OCR: ' + article, pattern, article === '11' ? 'il ' : 'i ');
}

let currentPage = 0;
const markdown = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
const lines = markdown.split('\n');

const globalTokens = [
    ['$ spicchi di aglio tritato', '5 spicchi di aglio tritato'],
    ['$ filetti di acciughe', '5 filetti di acciughe'],
    ['appena $ minuti', 'appena 8 minuti'],
    ['(oppure $ filetti tritati finemente)', '(oppure 8 filetti tritati finemente)'],
    ['$ spicchi di aglio', '5 spicchi di aglio'],
    ['g $o di acqua', 'g 50 di acqua'],
    ['ogni $ giorni', 'ogni 5 giorni'],
    ['per $ giorni circa', 'per 5 giorni circa'],
    ['£ $o di sale marino, fine', 'g 50 di sale marino, fine'],
    ['dopo $ minuti sono pronti', 'dopo 5 minuti sono pronti'],
    ['$ pomodori pelati', '5 pomodori pelati'],
    ['$ uova', '5 uova'],
    ['cm 4 x $).', 'cm 4 x 5).'],
    ['$i melanzane', '5 melanzane'],
    ['$, i carciofi saranno', '5, i carciofi saranno'],
    ['2 $o di olio extra vergine di oliva', 'g 50 di olio extra vergine di oliva'],
    ['$ pomodorini a ciliegia', '8 pomodorini a ciliegia'],
    ['Ingredienti per 6 persone: $', 'Ingredienti per 6 persone:'],
    ['e $00 di seppie', 'g 500 di seppie'],
    ['g $o di formaggio Latteria', 'g 50 di formaggio Latteria'],
    ['trascorsi $', 'trascorsi 5'],
    ['$ peperoni grossi', '5 peperoni grossi'],
    ['circa $ minuti, a', 'circa 5 minuti, a'],
    ['$ minuti prima di toglierli', '5 minuti prima di toglierli'],
    ['2 $o di strutto', 'g 50 di strutto'],
    ['teglia da forno con $ fette di pancetta', 'teglia da forno con 5 fette di pancetta'],
    ['g $o di funghi spugnole', 'g 50 di funghi spugnole'],
    ['circa $ minuti stemperatevi', 'circa 5 minuti stemperatevi'],
    ['11, $ di brodo', 'l 1,5 di brodo'],
    ['4 o $ cipollotti', '4 o 5 cipollotti'],
    ['8 foglie di vite o 5$ di fico', '8 foglie di vite o 5 di fico'],
    ['$ pomodori maturi (privati della pelle, dei semi e', '5 pomodori maturi (privati della pelle, dei semi e'],
    ['dopo altri $ minuti di fiamma bassa', 'dopo altri 5 minuti di fiamma bassa'],
    ['g 2$ di burro', 'g 25 di burro'],
    ['$ peperoni dolci, grossi', '5 peperoni dolci, grossi'],
    ['$ arance, affettate', '5 arance, affettate'],
    ['8 $ di chiodo di garofano', 'g 5 di chiodo di garofano'],
    ['almeno $, riprende-', 'almeno 8, riprende-'],
    ['$ cm; da cuocere', '8 cm; da cuocere'],
    ['$ albumi', '5 albumi'],
    ['g $o di zucchero', 'g 50 di zucchero'],
    ['& $o di zucchero', 'g 50 di zucchero'],
    ['Dopo $ anni di invecchiamento', 'Dopo 5 anni di invecchiamento'],
    ['11,$°, nel-', '11,5°, nel-'],
    ['& mele', '8 mele'],
    ['& So di burro', 'g 50 di burro'],
    ['(& 45 in estate)', '(g 45 in estate)'],
    ['toma € con', 'toma e con'],
    ['€ 60 di pangrattato', 'g 60 di pangrattato'],
    ['€ 200 di fegato', 'g 200 di fegato'],
    ['£saro bianco', 'Esaro bianco'],
    ['cuore, € ritagli', 'cuore, e ritagli'],
    ['£ So di burro', 'g 50 di burro'],
    ['£ So di olive nere snocciolate', 'g 50 di olive nere snocciolate'],
    ['£saro rosato', 'Esaro rosato'],
    ['£ 100 fra granelli e cervella', 'g 100 fra granelli e cervella'],
    ['€ 120 di pecorino grattugiato', 'g 120 di pecorino grattugiato'],
    ['& 180 g di pane comune', 'g 180 g di pane comune'],
    ['€ 400 di borragine', 'g 400 di borragine'],
    ['€ 120 di burro', 'g 120 di burro'],
    ['&£ 30 di burro', 'g 30 di burro'],
    ['£ 600) patate, lessate', 'g 600 patate, lessate'],
    ['scolatele € disponetele', 'scolatele e disponetele'],
    ['€ piuttosto sodo', 'e piuttosto sodo'],
    ['€ 200 di polpa di agnello', 'g 200 di polpa di agnello'],
    ['£ 80 olio extra vergine di oliva', 'g 80 olio extra vergine di oliva'],
    ['£/oro rosato', 'Eloro rosato'],
    ['spinaci € ricotta', 'spinaci e ricotta'],
    ['€ 200 di pisellini', 'g 200 di pisellini'],
    ['&£ 40 di parmigiano', 'g 40 di parmigiano'],
    ['£30 di burro', 'g 30 di burro'],
    ['€ frittatine', 'e frittatine'],
    ['£ SO di burro', 'g 50 di burro'],
    ['almeno un’ora € mezza', 'almeno un’ora e mezza'],
    ['€ potrete aggregarvi', 'e potrete aggregarvi'],
    ['salate € fate cuocere', 'salate e fate cuocere'],
    ['sale, pepe € cannella', 'sale, pepe e cannella'],
    ['€ 20 di funghi secchi', 'g 20 di funghi secchi'],
    ['£ 400 lenticchie', 'g 400 lenticchie'],
    ['ricoperto €', 'ricoperto e'],
    ['vino rosso €', 'vino rosso e'],
    ['& pomodori pelati frantumati', 'i pomodori pelati frantumati'],
    ['&10 di zucchero', 'g 10 di zucchero'],
    ['€ pepe e irrorate', 'e pepe e irrorate'],
    ['€ 40 di burro', 'g 40 di burro'],
    ['€ 120 di provola', 'g 120 di provola'],
    ['€ 200 di pastafrolla', 'g 200 di pastafrolla'],
    ['& noci', '8 noci'],
    ['£/ba bianco o rosato', 'Elba bianco o rosato'],
    ['£ 500 tra bietole e spinaci', 'g 500 tra bietole e spinaci'],
    ['€ 120 di prosciutto', 'g 120 di prosciutto'],
    ['aglio €', 'aglio e'],
    ['£ I2o di parmigiano', 'g 120 di parmigiano'],
    ['mescolate ancora € rivestite', 'mescolate ancora e rivestite'],
    ['g &o di guanciale', 'g 80 di guanciale'],
    ['& uova', '8 uova'],
    ['€ 150 di passato di pomodoro', 'g 150 di passato di pomodoro'],
    ['&£ 25 di formaggio pecorino', 'g 25 di formaggio pecorino'],
    ['250 £ di olio', '250 g di olio'],
    ['150 £ di burro', '150 g di burro'],
    ['& SO di zuccata', 'g 50 di zuccata'],
    ['100 & di farina', '100 g di farina'],
    ['€ 500 di zucchero', 'g 500 di zucchero'],
    ['& 60 zucca candita', 'g 60 zucca candita'],
    ['& So di zucchero', 'g 50 di zucchero'],
    ['scampi €', 'scampi e'],
    ['naci € ricotta', 'naci e ricotta'],
    ['un’ora € mezza', 'un’ora e mezza'],
    ['un’ora €', 'un’ora e'],
    ['€ fate cuocere', 'e fate cuocere'],
    ['pepe € cannella', 'pepe e cannella'],
    ['pepe €', 'pepe e'],
    ['250 £', '250 g'],
    ['ro € macinato', 'ro e macinato'],
    ['Forastera €', 'Forastera e'],
    ['renano € italico', 'renano e italico'],
    ['minimo15°®', 'minimo 15°'],
    ['im acqua', 'in acqua'],
    ['dl 1 di di', 'dl 1 di'],
    ['scioline.', 'striscioline.'],
    ['timo-/imone', 'timo-limone'],
    ['Folio', 'l’olio'],
    ['g2 200) di mascarpone', 'g 200 di mascarpone'],
    ['ritaglicrete', 'ritaglierete'],
    ['5S cm', '5 cm'],
    ['L1 di brodo', 'l 1 di brodo'],
    ['kg1,', 'kg 1,'],
    ['in12', 'in 12'],
    ['lunghi1o-15', 'lunghi 10-15'],
    ['PESCÌ', 'PESCI'],
    ['almeno15', 'almeno 15'],
    ['I2 carciofi', '12 carciofi'],
    ['IÌ parmigiano', 'Il parmigiano'],
    ['î polmoni', 'i polmoni'],
    ['î fegatini', 'i fegatini'],
    ['î soli tuorli', 'i soli tuorli'],
    ['Con î gelificanti', 'Con i gelificanti'],
    ['Ì’ esterno', 'l’esterno'],
    ['Ì I di brodo buono', 'l 1 di brodo buono'],
    ['un Ì di vino bianco secco', 'un l di vino bianco secco'],
    ['mezzo Ì di aceto', 'mezzo l di aceto'],
    ['un Î di acqua', 'un l di acqua'],
    ['un Ì di panna', 'un l di panna'],
    ['g Ì di lievito', 'g 5 di lievito'],
    ['Cainpania', 'Campania'],
    ['gialio', 'giallo'],
    ['1l°', '11°'],
    ['I1°', '11°'],
    ['Î1°', '11°'],
    ['î soli gherigli', 'i soli gherigli'],
    ['minimo1o°', 'minimo10°'],
    ['Zrentino', 'Trentino'],
    ['7ren-', 'Tren-'],
    ['Toc°', 'Toc’'],
    ['raîteristico', 'ratteristico'],
    ['Civrargiu, SÌ', 'Civrargiu, 51'],
    ['ma11,5°', 'ma 11,5°'],
    ['lc bietole', 'le bietole'],
    ['Ì 1,5 di brodo di carne', 'l 1,5 di brodo di carne'],
    ['0 pecorino', 'o pecorino'],
    ['pepere/la', 'peperella'],
    ['d°ore', 'd’ore'],
    ['corbu/e', 'corbule'],
    ['bir/a', 'birra'],
    ['mo/a', 'mola'],
    ['simbu/la', 'simbula'],
    ['scif/éddas', 'sciféddas'],
    ['A/ghero', 'Alghero'],
    ['Sa/mistrà', 'Salmistrà'],
    ['biro/do', 'biroldo'],
    ['diro/do', 'biroldo'],
    ['ma/legato', 'mallegato'],
    ['Sy/vaner', 'Sylvaner'],
    ['E/ba', 'Elba'],
    ['fregu/a', 'fregula'],
    ['frascare/li', 'frascarelli'],
    ['A/bana', 'Albana'],
    ['/regu/a', 'fregula'],
    ['/asagno/o', 'lasagnolo'],
    ['estaro/o', 'testarolo'],
    ['sa/tarle', 'saltarle'],
    ['l°a', 'l’a'],
    ['So/unto', 'Solunto'],
    ['Va/ldadige', 'Valdadige'],
    ['l°o', 'l’o'],
    ['Po/lino', 'Pollino'],
    ['Bo/gheri', 'Bolgheri'],
    ['s°è', 's’è'],
    ['A/barola', 'Albarola'],
    ['A/oysia', 'Aloysia'],
    ['O/frepo', 'Oltrepo'],
    ['Va/damato', 'Valdamato'],
    ['Ca/abria', 'Calabria'],
    ['gocee', 'gocce'],
    ['cuoceria', 'cuocerla'],
    ['Fosso piccante', 'rosso piccante'],
    ['tritaio', 'tritato'],
    ['Iuganega', 'luganega'],
    ['fardo', 'lardo'],
    ['prezzentolo', 'prezzemolo'],
    ['cassseruola', 'casseruola'],
    ['ingannnare', 'ingannare'],
    ['raffredddare', 'raffreddare'],
    ['cuccchiai', 'cucchiai'],
    ['prosciuttto', 'prosciutto'],
    ['mazzzetto', 'mazzetto'],
    ['disosssatela', 'disossatela'],
    ['zuccchero', 'zucchero'],
    ['irrrorateli', 'irrorateli'],
    ['cuccchiaio', 'cucchiaio'],
    ['pangratttato', 'pangrattato'],
    ['sssorbente', 'assorbente'],
    ['ammmollato', 'ammollato'],
    ['sgoccciolate', 'sgocciolate'],
    ['apppassite', 'appassite'],
    ['salsicccia', 'salsiccia'],
    ['formagggio', 'formaggio'],
    ['“2°”', '“2”'],
    ['s°impasta', 's’impasta'],
    ['s°ottiene', 's’ottiene'],
    ['mo°', 'mo’'],
    ['Ì soli tuorli', 'i soli tuorli'],
    ['AI', 'Al'],
    ['ie', 'le'],
    ['Ie', 'le'],
    ['ì', 'i'],
    ["Y'interno", 'l’interno'],
    ['Gafgano', 'Gargano'],
    ['foma', 'forma'],
    ['ja ricotta', 'la ricotta'],
    ['t bordi', 'i bordi'],
    ["t'olio", "l'olio"],
    ['t’olio', 'l’olio'],
    ['n modo', 'in modo'],
    ['n cesto', 'in cesto'],
    ["F'ocara", 'Focara'],
    ['F’oianeghe', 'Foianeghe'],
    ['V’oca', 'l’oca'],
    ['d° Italia', 'd’Italia'],
    ['Jette', 'fette'],
    ['Ja', 'la'],
    ['Je', 'le'],
    ['je', 'le'],
    ['Jento', 'lento'],
    ['jasciateli', 'lasciateli'],
    ['jepre', 'lepre'],
    ['Jombate', 'lombate'],
    ['kg J', 'kg 1'],
    ['Jarina', 'farina'],
    ['Ji', 'li'],
    ['Jenta', 'lenta'],
    ['Jegno', 'legno'],
    ['JI', 'Il'],
    ['jo', 'lo'],
    ['Praparate', 'Preparate'],
    ['m polvere', 'in polvere'],
    ['I sugo caldo', 'Il sugo caldo'],
    ['S cucchiai di zucchero', '5 cucchiai di zucchero'],
    ['S sardelle sotto sale', '5 sardelle sotto sale'],
    ['S giorni almeno', '5 giorni almeno'],
    ['I’ Ascensione', 'L’Ascensione'],
    ['I latte intero', 'Il latte intero'],
    ['u chicchi', 'a chicchi'],
    ['ke I di frattaglie', 'kg 1 di frattaglie'],
    ['fettucce larghe I cm', 'fettucce larghe 1 cm'],
    ['1 I di latte', 'l 1 di latte'],
    ['H con il sugo', 'li con il sugo'],
    ['I! due formaggi', 'i due formaggi'],
    ['l I di brado, circa', 'l 1 di brodo, circa'],
    ['i I di brodo vegetale', 'l 1 di brodo vegetale'],
    ['I) di brodo leggero', 'l 1 di brodo leggero'],
    ['I kg di pancetta', '1 kg di pancetta'],
    ['2,5 I di brodo', '2,5 l di brodo'],
    ['k 1,2 di coppone', 'kg 1,2 di coppone'],
    ['1 2,5 di brodo buono', 'l 2,5 di brodo buono'],
    ['I I di vino rosso', 'l 1 di vino rosso'],
    ['I kg di manzo', '1 kg di manzo'],
    ['I I di latte intero', 'l 1 di latte intero'],
    ['3 I di', '3 l di'],
    ['Cervella f ritta', 'Cervella fritta'],
    ['mezzo I di latte freschissimo', 'mezzo l di latte freschissimo'],
    ['k I di animelle', 'kg 1 di animelle'],
    ['un I di olio di oliva', 'un l di olio di oliva'],
    ['I litro di acqua', '1 litro di acqua'],
    ['S cuori di lattuga', '5 cuori di lattuga'],
    ['I Anice', 'l’anice'],
    ['S tuorli', '5 tuorli'],
    ['mezzo I di vino bianco secco', 'mezzo l di vino bianco secco'],
    ["U'artificio", 'L’artificio'],
    ['dell’ Ascensione', 'dell’Ascensione'],
    ['I°.', '11°.'],
    ['f(diavolillo)', '(diavolillo)'],
    ['pit volte', 'più volte'],
    ['g 150 di zucchero m', 'g 150 di zucchero'],
    ['I e strizzateli', 'li e strizzateli'],
    ['1 2,5 di brodo buono', 'l 2,5 di brodo buono'],
    ['n BOUQUET T', ''],
    ['con I fagioli', 'con i fagioli'],
    ['u piacere', 'a piacere'],
    ['I di buon brodo caldo', 'l 1 di buon brodo caldo'],
    ['I tempo che rosola', 'Il tempo che rosola'],
    ['H tempo di dorarle', 'Il tempo di dorarle'],
    ['n un cesto', 'in un cesto'],
    ['H giorno dopo', 'Il giorno dopo'],
    ['im abbondante', 'in abbondante'],
    ['Busilicata', 'Basilicata'],
    ['m scapece', 'in scapece'],
    ['dI I di olio extra vergine di oliva', 'dl 1 di olio extra vergine di oliva'],
    ['con I rebbi', 'con i rebbi'],
    ['soministrare', 'somministrare'],
    ['sl presta', 'si presta'],
    ['a mescolate', 'a mescolare'],
    ['pol i capperini', 'poi i capperini'],
    ['moscafa', 'moscata'],
    ['Spegnete Il fuoco', 'Spegnete il fuoco'],
    ['l’olto', 'l’olio'],
    ['nell’olto', 'nell’olio'],
    ['Hevito', 'lievito'],
    ['hevito', 'lievito'],
    ['Hevitare', 'lievitare'],
    ['po!', 'poi'],
    ['fettini sottili', 'fettine sottili'],
    ['alutandovi', 'aiutandovi'],
    ['arutandovi', 'aiutandovi'],
    ['Alutandovi', 'Aiutandovi'],
    ['nova sbattute', 'uova sbattute'],
    ['mescolate Il tutto', 'mescolate il tutto'],
    ['Mescolate Il tutto', 'Mescolate il tutto'],
    ['spegnete Il fuoco', 'spegnete il fuoco'],
    ['piecante', 'piccante'],
    ['iritato', 'tritato'],
    ['gruttugiato', 'grattugiato'],
    ['rrofie', 'trofie'],
    ['mal aiutandovi', 'mai aiutandovi'],
    ['phi consistente', 'più consistente'],
    ['Questello', 'Quistello'],
    ['VYolio', 'l’olio'],
    ['quOroso', 'quoroso'],
    ['quoroso Secco', 'quoroso secco'],
    ['Volifettkase', 'Vollfettkase'],
    ['Syvlvaner', 'Sylvaner'],
    ['aqua', 'acqua'],
    ['Con questro', 'Con questo'],
    ['Gewiirztraminer', 'Gewürztraminer'],
    ['Gewilirztraminer', 'Gewürztraminer'],
    ['quarido', 'quando'],
    ['da I q di latte', 'da 1 q di latte'],
    ['exira', 'extra'],
    ['ucqua', 'acqua'],
    ['fiepida', 'tiepida'],
    ['ventiquatir’ore', 'ventiquattr’ore'],
    ['Pacqua salata', 'l’acqua salata'],
    ['Pochj', 'Pochi'],
    ['YFOSSO', 'rosso'],
    ['Ligw', 'Liguria'],
    ['Hquoroso', 'liquoroso'],
    ['un ke', 'un kg'],
    ['ke 2 di paliata', 'kg 2 di paliata'],
    ['Lacrvyma', 'Lacryma'],
    ['witati', 'tritati'],
    ["d'Aqui", "d'Acqui"],
    ['ke 1 di mandorle', 'kg 1 di mandorle'],
    ['Yrentino-Alto Adige', 'Trentino-Alto Adige'],
    ['Yrentino', 'Trentino'],
    ['Venero', 'Veneto'],
    ['Vereto', 'Veneto'],
    ['Zoscana', 'Toscana'],
    ['Zxppa', 'Zuppa'],
    ['Mezzo I di acqua tiepida', 'mezzo l di acqua tiepida'],
    ['mezzo I di latte caldo', 'mezzo l di latte caldo'],
    ['I o 2 foglie di alloro', '1 o 2 foglie di alloro'],
    ['1 2,5 di brodo', 'l 2,5 di brodo'],
    ['I 3 litri di acqua', 'l 3 litri di acqua'],
    ['Con I fagioli', 'con i fagioli'],
    ['lavato I filetti', 'lavato i filetti'],
    ['alutati', 'aiutati'],
    ['brado', 'brodo'],
    ['garago]j', 'garagoj'],
    ['ima vanno bene anche se', 'ma vanno bene anche se'],
    ['bri]-', 'bri-'],
    ['Jaculi]lo', 'Jaculillo'],
    ['Hellrig]', 'Hellrigl'],
    ['3$', '38'],
    ['94$', '948'],
    ['$46', '546'],
    ['125$', '1258'],
    ['$52', '552'],
    ['108$', '1088'],
    ['50$', '505'],
    ['came', 'carne'],
    ['Came', 'Carne'],
    ['cami', 'carni'],
    ['Cami', 'Carni'],
    ['tritacame', 'tritacarne'],
    ['Camevale', 'Carnevale'],
    ['camesecca', 'carnesecca'],
    ['budelie', 'budelle'],
    ['scamitelo', 'scarnitelo'],
    ['batticame', 'batticarne'],
    ['delia', 'della'],
    ['delie', 'delle'],
    ['deli pomodori', 'dei pomodori'],
    ['0 di siero', 'o di siero'],
    ['0 in brodo', 'o in brodo'],
    ['g 00 di olio extra vergine di aliva', 'g 60 di olio extra vergine di oliva'],
    ['210 di cannella', 'g 10 di cannella'],
    ['82 300 di', 'g 300 di'],
    ['8100 di animelle', 'g 100 di animelle'],
    ['di } di aceto forte', 'dl 1 di aceto forte'],
    ['I] di latte', 'l 1 di latte'],
    ['I } di latte', 'l 1 di latte'],
    ['1/4 di [ di latte', '1/4 di l di latte'],
    ['1] di sangue', 'l 1 di sangue'],
    ['1] trito', 'il trito'],
    ['i} matterello', 'il matterello'],
    ['1} profumo', 'Il profumo'],
    ['Ghemme}', 'Ghemme)'],
    ['coste bianche}', 'coste bianche)'],
    ['teglia, [', 'teglia, poi'],
    ['neli’aceto', 'nell’aceto'],
    ['neli’olio', 'nell’olio'],
    ['nelia', 'nella'],
    ['fobbrica', 'fabbrica'],
    ['alioro', 'alloro'],
    ['aliva', 'oliva'],
    ['piccanie', 'piccante'],
    ['ia', 'la'],
    ['Ia', 'La'],
    ['alia', 'alla'],
    ['ii', 'il'],
    ['Ii', 'Il'],
    ['iI', 'il'],
    ['II giorno', 'Il giorno'],
    ['II prosciutto', 'Il prosciutto'],
    ['II di', 'l 1 di'],
    ['II brodo', 'il brodo'],
    ['3/4 di I di', '3/4 di l di'],
    ['dl Idi', 'dl 1 di'],
    ['dl |} di', 'dl 1 di'],
    ['kg |]', 'kg 1'],
    ['kg |', 'kg 1'],
    ['ia-', 'la-'],
    ['padelia', 'padella'],
    ['cuechiaio', 'cucchiaio'],
    ['prezzemalo', 'prezzemolo'],
    ['boliore', 'bollore'],
    ['scarmnendo', 'scarnendo'],
    ['furina', 'farina'],
    ['hirra', 'birra'],
    ['fammorbidito', 'ammorbidito'],
    ['fammollati', 'ammollati'],
    ['fammollata', 'ammollata'],
    ['ammiollata', 'ammollata'],
    ['ammoliato', 'ammollato'],
    ['ciuffetio', 'ciuffetto'],
    ['fomo', 'forno'],
    ['sl trita', 'si trita'],
    ['tritatì', 'tritati'],
    ['essicati', 'essiccati'],
    ['essicato', 'essiccato'],
    ['papate', 'patate'],
    ['ia cipolla', 'la cipolla'],
    ['Tero/dego', 'Teroldego'],
    ['fetie', 'fette'],
    ['feite', 'fette'],
    ['graitugiato', 'grattugiato'],
    ['speronelia', 'speronella'],
    ['mulinelio', 'mulinello'],
    ['mulinelto', 'mulinello'],
    ['mulinella', 'mulinello'],
    ['mulînello', 'mulinello'],
    ['mollustri', 'molluschi'],
    ['mulluschi', 'molluschi'],
    ['succhero', 'zucchero'],
    ['cucchero', 'zucchero'],
    ['cummeossaî', 'cummossai'],
    ['coccoî', 'coccoi'],
    ['C°è', 'C’è'],
    ['s1', 'si'],
    ['7raminer', 'Traminer'],
    ['7rentino', 'Trentino'],
    ['7oscana', 'Toscana'],
    ['7orreguarto', 'Torrequarto'],
    ['ÎFaminer', 'Traminer'],
    ['Molî', 'Moli'],
    ['Vîno', 'Vino'],
    ['Corî rosso giovane', 'Cori rosso giovane'],
    ['Ragîù', 'Ragù'],
    ['Parriîna', 'Parrina'],
    ['laîte', 'latte'],
    ['îdeali', 'ideali'],
    ['îdeale', 'ideale'],
    ['întero', 'intero'],
    ['împastati', 'impastati'],
    ['trîtata', 'tritata'],
    ['tritatî', 'tritati'],
    ['spîcchi', 'spicchi'],
    ['macînato', 'macinato'],
    ['macellaîo', 'macellaio'],
    ['maturî', 'maturi'],
    ['maîale', 'maiale'],
    ['gherigliî', 'gherigli'],
    ['acinî', 'acini'],
    ['bianchettî', 'bianchetti'],
    ['dadinî', 'dadini'],
    ['dadîni', 'dadini'],
    ['mestolî', 'mestoli'],
    ['cucchiaîio', 'cucchiaio'],
    ['cucchiaîo', 'cucchiaio'],
    ['cucchiaîno', 'cucchiaino'],
    ['cucchiaî', 'cucchiai'],
    ['olîva', 'oliva'],
    ['olîo', 'olio'],
    ['tuorlî', 'tuorli'],
    ['deî', 'dei'],
    ['suî', 'sui'],
    ['îl', 'il'],
    ['Friulî', 'Friuli'],
    ['în', 'in'],
    ['În', 'In'],
    ['dî', 'di'],
    ['dì', 'di'],
    ['Îa', 'La'],
    ['Îo', 'Lo']
];

const pluralIArticles = [
    'formaggi', 'sapori', 'funghi', 'tartufi', 'tuorli', 'filetti', 'pinoli',
    'testi', 'ceci', 'fiori', 'rebbi', 'peperoni', 'ventrigli', 'pomodori',
    'taralli', 'crostini', 'gamberetti', 'fegatini', 'fagioli', 'garusoli',
    'polpastrelli', 'muscoli', 'pezzi', 'capperi', 'lati', 'legumi', 'lembi',
    'tagliolini', 'quadrucci', 'piselli', 'dadini', 'finocchietti', 'molluschi',
    'cubetti', 'carciofi', 'bordi', 'bigoli', 'cappellotti', 'casunziei',
    'cavatielli', 'cavattielli', 'ciciones', 'maccheroni', 'frascarelli',
    'fusilli', 'gamberi', 'gamberoni', 'gambi', 'gherigli', 'grani', 'gusci',
    'classici', 'biscotti', 'bocconotti', 'bracconieri', 'branzini', 'broccoli',
    'calamaretti', 'calamari', 'canederli', 'cardoncelli', 'cipollotti', 'cirri',
    'crauti', 'crostoli', 'dolcetti', 'ferri', 'fianchi', 'malloreddus',
    'melicotti', 'mirtilli', 'panforti', 'pansoti', 'panzerotti', 'passatelli',
    'pesci', 'piccioni', 'pisellini', 'pistacchi', 'polipi', 'polpi',
    'pomodorini', 'porri', 'rametti', 'ravioli', 'rigatoni', 'ritagli', 'rocchi',
    'rognoni', 'salumi', 'semi', 'tentacoli', 'tocchi', 'tonnarelli', 'tortelli',
    'tortelloni', 'vermicelli', 'vincisgrassi', 'Colli'
];

const ilArticles = [
    'mondo', 'vaso', 'matterello', 'baccalà', 'provolone', 'pezzo', 'sedano',
    'minestrone', 'lardo', 'concentrato', 'mollusco', 'burro', 'prezzemolo',
    'trito', 'taglio', 'formaggio', 'montone', 'brodo', 'bicchiere', 'succo',
    'tegame', 'basilico', 'timo', 'pesto', 'picciolo', 'polsonetto', 'fondo',
    'nonnulla', 'manzo', 'rotolo', 'prosciutto', 'fagioli', 'legumi', 'lato',
    'lembi', 'vino', 'sale', 'muggine'
];

const artifactLines = new Map([
    [9, new Set(['1l'])],
    [39, new Set(['4l'])],
    [493, new Set(['| III', 'CTTITTTTTTZZ®'])],
    [530, new Set(['$32'])],
    [549, new Set(['SSs1'])],
    [559, new Set(['S6l'])],
    [209, new Set(['21]'])],
    [309, new Set(['31]'])],
    [741, new Set(['{'])],
    [921, new Set(['pil', '0)', '}', 'CADE,', '} |'])],
    [998, new Set(['N Aa]'])],
    [1135, new Set(['104]'])],
    [1005, new Set(['9U1'])],
    [535, new Set(['€ Se'])],
    [1116, new Set(['TTD', '(|<'])],
    [647, new Set(['— ©»'])],
    [19, new Set(['2ì'])],
    [62, new Set(['Pe', '='])],
    [73, new Set(['c', 'TI'])],
    [265, new Set(['Mon 11)', 'lay tr ro', '= +4 e', 'GUIA', 'Si', 'FIPRIS PvoGLALII,'])],
    [309, new Set(['METTI CO NINSA NOE ONT', 'bas biagi È', 'porn'])],
    [463, new Set(['Da APRILE', 'NOVEMBRE', 'ra', 'Ta', '"cHIA Gravere LEO', 'DA GIUGNO', 'A OTTOBRE', 'SEO', 'PA APRILE Td s8°', 'À DE Spr', 'OTTOBRE ODUS sArGuo-'])],
    [651, new Set(['PPT Ù'])],
    [654, new Set(['SS', 'n'])],
    [1339, new Set(['Tini'])],
    [1144, new Set(['z', 'C'])],
    [513, new Set(['C'])],
    [1329, new Set(['SÀ'])],
    [460, new Set(['2', 'dex', 'I. Ze 77, È', 'Ve'])],
    [1241, new Set(['x So'])],
    [704, new Set(['Ska sal ISS SÒ', 'N AINEZIORI', 'SN'])],
    [742, new Set(['80', '+) Hi', '<< Y', 'È),', 'ZA'])],
    [1145, new Set(['105Ì'])],
    [1343, new Set(['OPODO', 'SSISSLII', 'SSA', 'FRBROSÌÌÀ', 'rame'])],
    [1394, new Set(['va INÒÌ', 'SS', 'NN di', 'TZ y', 'TER AZ, AR', '='])],
    [374, new Set(['DE E°'])],
    [13, new Set(['N+', 'zzz'])],
    [370, new Set(['DÌ', '“p =$', 'DU (DES', '5'])],
    [429, new Set(['$', 'l \\ \\', 'vi À', 'Y', 'es'])]
]);

const pageLineCorrections = new Map([
    [90, new Map([['sul Gafgano. ì', 'sul Gafgano.']])],
    [54, new Map([['13 di acqua a 10-12° (5 o 6 nei mesi estivi)', 'l 3 di acqua a 10-12° (5 o 6 nei mesi estivi']])],
    [114, new Map([['21 di olio di semi di arachidi o di mais', 'l 1 di olio di semi di arachidi o di mais']])],
    [127, new Map([['60 di punte di asparagi, già lessate', 'g 60 di punte di asparagi, già lessate']])],
    [209, new Map([['250 di emmental o gruyère tagliato a dadi.', 'g 250 di emmental o gruyère tagliato a dadi.']])],
    [342, new Map([['2200 di sardelle fresche o sotto sale', 'g 200 di sardelle fresche o sotto sale']])],
    [368, new Map([['8250 di mortadella tritata molto finemente', 'g 250 di mortadella tritata molto finemente']])],
    [270, new Map([['g 60) di burro', 'g 60 di burro'], ['11,5 di brodo', 'l 1,5 di brodo']])],
    [329, new Map([['11,5 di acqua', 'l 1,5 di acqua']])],
    [538, new Map([['11,5 di acqua', 'l 1,5 di acqua']])],
    [539, new Map([['11,8 di acqua', 'l 1,8 di acqua']])],
    [505, new Map([['820 di strutto', 'g 20 di strutto']])],
    [534, new Map([['8200 di ceci', 'g 200 di ceci']])],
    [639, new Map([['230 di burro', 'g 30 di burro']])],
    [663, new Map([['25 di funghi secchi (ammollati in acqua tiepida)', 'g 25 di funghi secchi (ammollati in acqua tiepida)']])],
    [669, new Map([['8280 di caciocavallo grattugiato', 'g 280 di caciocavallo grattugiato']])],
    [686, new Map([['230 di burro', 'g 30 di burro']])],
    [701, new Map([['830 di burro', 'g 30 di burro']])],
    [764, new Map([['240 di burro', 'g 40 di burro'], ['220 di burro', 'g 20 di burro'], ['11 di latte intero', 'l 1 di latte intero']])],
    [773, new Map([['230 di burro', 'g 30 di burro'], ['800 di grana padano grattugiato', 'g 800 di grana padano grattugiato']])],
    [775, new Map([['830 di burro', 'g 30 di burro'], ['8120 di formaggio fondente (preferibile la groviera)', 'g 120 di formaggio fondente (preferibile la groviera)']])],
    [931, new Map([['830 di zucchero', 'g 30 di zucchero']])],
    [955, new Map([['820 di burro', 'g 20 di burro']])],
    [1033, new Map([['11 di latte', 'l 1 di latte']])],
    [1042, new Map([['25 di capperini in salamoia, tritati', 'g 25 di capperini in salamoia, tritati']])],
    [1055, new Map([['21 di brodo vegetale', '2 l di brodo vegetale']])],
    [1074, new Map([['230 di farina', 'g 30 di farina']])],
    [1171, new Map([['840 di pangrattato', 'g 40 di pangrattato']])],
    [1273, new Map([['600 di patate a polpa gialla (non nuove) ta-', 'g 600 di patate a polpa gialla (non nuove) ta-']])],
    [1292, new Map([['8150 di grano', 'g 150 di grano']])],
    [1331, new Map([['11 di acqua', 'l 1 di acqua']])],
    [1337, new Map([['11 di latte fresco, intero', 'l 1 di latte fresco, intero']])],
    [1351, new Map([['21 di mosto di vino bianco o rosso', '2 l di mosto di vino bianco o rosso']])],
    [1374, new Map([['11 di latte', 'l 1 di latte']])],
    [1375, new Map([['11 di latte', 'l 1 di latte']])],
    [1376, new Map([['12 di latte', 'l 2 di latte']])],
    [1381, new Map([['11 di vino cotto', 'l 1 di vino cotto']])],
    [1388, new Map([['300 di purea di zucca; infine sgusciate le uo-', 'g 300 di purea di zucca; infine sgusciate le uo-']])],
    [1389, new Map([['240 di latte', 'g 240 di latte']])],
    [1392, new Map([['11 di latte', 'l 1 di latte']])],
    [1395, new Map([['2400 di mandorle dolci', 'g 400 di mandorle dolci']])],
    [1400, new Map([['11 di latte fresco, intero', 'l 1 di latte fresco, intero'], ['14 di acqua tiepida', 'l 4 di acqua tiepida']])],
    [1405, new Map([['11 di acqua bollente', 'l 1 di acqua bollente']])],
    [1441, new Map([['11 di latte fresco, intero', 'l 1 di latte fresco, intero']])],
    [1446, new Map([['150 di zucchero', 'g 150 di zucchero']])],
    [1460, new Map([['830 di zucchero', 'g 30 di zucchero']])],
    [1461, new Map([['84 di lievito di birra', 'g 4 di lievito di birra']])],
    [1475, new Map([['8180 di cioccolato fondente', 'g 180 di cioccolato fondente']])],
    [1477, new Map([['11 di latte', 'l 1 di latte'], ['11 di latte intero', 'l 1 di latte intero']])],
    [1483, new Map([['870 di lardo', 'g 70 di lardo']])],
    [667, new Map([['8800 di salsiccia', 'g 800 di salsiccia']])],
    [1208, new Map([['11,8 di acqua calda', 'l 1,8 di acqua calda']])],
    [1391, new Map([['Scaldate 1l 1 di latte, con un pizzico di sale e', 'Scaldate il l di latte, con un pizzico di sale e']])],
    [1048, new Map([['un branzino di circa |! kg', 'un branzino di circa 1 kg']])],
    [155, new Map([['Murici (o garago]j) in porchetta Marche', 'Murici (o garagoj) in porchetta Marche']])],
    [197, new Map([['{ 1,2 di sangue di maiale freschissimo', 'l 1,2 di sangue di maiale freschissimo']])],
    [248, new Map([['{ 1,5 di brodo di carne', 'l 1,5 di brodo di carne']])],
    [340, new Map([['tante tagliatelle (bardele) larghe circa | cm.', 'tante tagliatelle (bardele) larghe circa 1 cm.']])],
    [560, new Map([['{1 di brodo di carne, circa', 'l 1 di brodo di carne, circa']])],
    [592, new Map([['823 di strutto', 'g 25 di strutto']])],
    [908, new Map([['{ 1,5 di acqua', 'l 1,5 di acqua']])],
    [1139, new Map([['circa mezzo ] di acqua, regolate di sale e', 'circa mezzo l di acqua, regolate di sale e']])],
    [1418, new Map([['tili (circa | cm), del diametro di circa 10 cm.', 'tili (circa 1 cm), del diametro di circa 10 cm.']])],
    [1528, new Map([['delle bucce), ecco un vino di colore rosa intenso, bri]-', 'delle bucce), ecco un vino di colore rosa intenso, bri-']])],
    [1556, new Map([['e Jaculi]lo vinificate in bianco, si produce un vino di', 'e Jaculillo vinificate in bianco, si produce un vino di']])],
    [1574, new Map([['Crostini di caccia, Toscana, 11]', 'Crostini di caccia, Toscana, 111']])],
    [1606, new Map([['Lumellu, {51', 'Lumellu, 151']])],
    [1609, new Map([['Calzone di bietola, 114]', 'Calzone di bietola, 1141']])],
    [1629, new Map([['Murici (o garago]) in porchetta, 157', 'Murici (o garagoj) in porchetta, 157']])],
    [1646, new Map([["Filetti di sogliola all’ Andrea Hellrig], 964", "Filetti di sogliola all’Andrea Hellrigl, 964"]])],
    [394, new Map([['$ pomodori maturi (privati della pelle, dei semi e', '5 pomodori maturi (privati della pelle, dei semi e']])],
    [670, new Map([['$ pomodori maturi (privati della pelle, dei semi e', '8 pomodori maturi (privati della pelle, dei semi e']])],
    [1220, new Map([['$ pomodori maturi (privati della pelle, dei semi e', '5 pomodori maturi (privati della pelle, dei semi e']])],
    [1259, new Map([['sale n', 'sale']])],
    [1339, new Map([['n.', 'ti.']])],
]);

for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    const pageMatch = line.match(/^<!-- PDF page (\d{4}) \|/);
    if (pageMatch) currentPage = Number(pageMatch[1]);

    const pageArtifacts = artifactLines.get(currentPage);
    if (pageArtifacts && pageArtifacts.has(line.trim())) {
        record('riga OCR artefatta pagina ' + currentPage, line.trim());
        line = '';
    }

    const pageCorrections = pageLineCorrections.get(currentPage);
    if (pageCorrections && pageCorrections.has(line)) {
        const right = pageCorrections.get(line);
        record('correzione OCR verificata pagina ' + currentPage, line);
        line = right;
    }

    line = replaceTokens(line, globalTokens, false);
    line = replaceRegex(line, 'token: 7rentino/fobbrica prima di trattino', /(?<![\p{L}\p{N}])(?:7rentino|fobbrica)(?=-)/gu, match => match === '7rentino' ? 'Trentino' : 'fabbrica');
    if (currentPage >= bodyFirstPage && currentPage <= bodyLastPage) {
        line = replaceRegex(
            line,
            'unità litri OCR: cifra concatenata prima di quantità',
            /^(\s*)1(\d(?:[.,]\d+)?)\s+di (?=(?:acqua|brodo|latte|olio|vino|mosto|sugo|aceto)\b)/u,
            (match, indent, quantity) => indent + 'l ' + quantity + ' di '
        );
    }
    line = replaceContextualPunctuation(line);
    // Dopo le correzioni quantitative sopra, le graffe residue appartengono
    // tutte a parentesi tonde spezzate tra righe consecutive.
    line = replaceRegex(line, 'punteggiatura OCR contestuale: graffa → parentesi tonda', /[{}]/gu, match => match === '{' ? '(' : ')');
    line = replaceContextualPipes(line);
    line = replaceContextualSquareArtifacts(line);

    // In prosa, il gruppo OCR “1l” è l'articolo “il” quando è seguito da un
    // nome; si lasciano invariati i casi numerici o di grado alcolico.
    line = replaceRegex(
        line,
        'articolo OCR contestuale: 1l → il',
        /(?<![\p{L}\p{N}])1l (?=(?:burro|composto|farro|formaggio|latte|mascarpone|matterel(?:lo)?|primo|tegame|tipo|trito|vino)(?![\p{L}\p{N}]))/gu,
        'il '
    );

    line = replaceRegex(line, 'carattere OCR: € → E', /^(\s*)€ (?=preparatevi\b)/u, (match, indent) => indent + 'E ');

    line = replaceRegex(
        line,
        'unità chilogrammi OCR: kg1, → kg 1,',
        /(?<![\p{L}\p{N}])kg1(?=,[0-9])/gu,
        'kg 1'
    );
    line = replaceRegex(
        line,
        'regione OCR: Zrentino → Trentino',
        /(?<![\p{L}\p{N}])Zrentino(?=-|\b)/gu,
        'Trentino'
    );
    line = replaceRegex(
        line,
        'elisione OCR: l° → l’',
        /(?<![\p{L}\p{N}])l°(?=[ao])/gu,
        'l’'
    );
    line = replaceRegex(
        line,
        'parola spezzata OCR: Jardel- → lardel-',
        /(?<![\p{L}\p{N}])Jardel-/gu,
        'lardel-'
    );
    line = replaceRegex(
        line,
        'parola spezzata OCR: ja- → la-',
        /(?<![\p{L}\p{N}])ja-/gu,
        'la-'
    );
    line = replaceRegex(
        line,
        'parola spezzata OCR: V’a- → l’a-',
        /(?<![\p{L}\p{N}])V[’']a-/gu,
        'l’a-'
    );
    line = replaceRegex(
        line,
        'parola spezzata OCR: V’em- → l’em-',
        /(?<![\p{L}\p{N}])V[’']em-/gu,
        'l’em-'
    );
    line = replaceRegex(
        line,
        'parola spezzata OCR: V’al- → l’al-',
        /(?<![\p{L}\p{N}])V[’']al-/gu,
        'l’al-'
    );
    line = replaceRegex(
        line,
        'parola spezzata OCR: I AI- → l’Al-',
        /(?<![\p{L}\p{N}])I AI-/gu,
        'l’Al-'
    );
    line = replaceRegex(
        line,
        'parola spezzata OCR: d’AI- → d’Al-',
        /(?<![\p{L}\p{N}])d[’']AI-/gu,
        'd’Al-'
    );
    line = replaceRegex(
        line,
        'parola spezzata OCR: I amal- → l’amal-',
        /(?<![\p{L}\p{N}])I amal-/gu,
        'l’amal-'
    );

    // In prosa il singolo carattere “c”, separato come parola, è l'OCR della
    // congiunzione “e”. Non tocca i casi autentici “c’è”/“c'era”, né le parole
    // in cui la c appartiene al vocabolo precedente o successivo.
    line = replaceRegex(
        line,
        'congiunzione OCR: c → e',
        /(?<![\p{L}\p{N}])c(?=\s|[,;.])/gu,
        'e'
    );

    const followingLine = (lines[index + 1] || '').trimStart();
    if (/\b1l$/u.test(line) && /^(?:composto|matterello|matterel-|trito|vino)\b/u.test(followingLine)) {
        line = replaceRegex(line, 'articolo OCR contestuale a capo: 1l → il', /1l$/u, 'il');
    }

    // Il carattere copyright è OCR della “o” nelle alternative; si conserva
    // invece l'ornamento isolato e il vero credito fotografico di copertina.
    if (line.includes('©') && line.trim() !== '— ©»' && !line.includes('©Oran')) {
        line = replaceRegex(line, 'simbolo OCR © → o', /©/gu, 'o');
    }

    // Nei quantitativi in grammi il carattere corsivo “g” è stato riconosciuto
    // come £, &, 8, e oppure 2. Si corregge solo il prefisso di righe che
    // contengono chiaramente un numero seguito da “di”; quantità dubbie come
    // “$0”, “8100” o “82 300” non vengono reinterpretate.
    if (currentPage >= bodyFirstPage && currentPage <= bodyLastPage) {
        line = replaceRegex(
            line,
            'unità grammi OCR',
            /^(\s*)(?:g£|8g|2g|£|&|8|e|2)\s+(?=\d{1,4}(?:[.,]\d+)?(?:-\d{1,4}(?:[.,]\d+)?)?\)?\s+d(?:i|î|el|ella)\b)/u,
            (match, indent) => indent + 'g '
        );
        line = replaceRegex(line, 'unità chilogrammi: I/barra → 1', /^(\s*)kg [I|](?=\s+di\b)/u, (match, indent) => indent + 'kg 1');
        line = replaceRegex(line, 'unità chilogrammi OCR: Kg I → kg 1', /^(\s*)Kg I(?=\s+di\b)/u, (match, indent) => indent + 'kg 1');
        line = replaceRegex(line, 'unità decilitri: I/barra → 1', /^(\s*)dl [I|](?=\s+di\b)/u, (match, indent) => indent + 'dl 1');
        line = replaceRegex(line, 'unità litri: I → l', /^(\s*)I (?=\d(?:[.,]\d+)?\s+di\b)/u, (match, indent) => indent + 'l ');
        line = replaceRegex(line, 'unità litri: 1 1 → l 1', /^(\s*)1 1(?=\s+di\b)/u, (match, indent) => indent + 'l 1');
        line = replaceRegex(line, 'unità decilitri OCR: di I/ ] di → dl 1 di', /^(\s*)di (?:I|\]) di\b/u, (match, indent) => indent + 'dl 1 di');
        line = replaceRegex(line, 'unità decilitri OCR: di numero di → dl numero di', /^(\s*)di (\d+(?:[.,]\d+)?)(?=\s+di\b)/u, (match, indent, quantity) => indent + 'dl ' + quantity + ' di');
        line = replaceRegex(line, 'unità decilitri OCR: mezzo/un di di → dl', /(?<![\p{L}])(?:mezzo|un) di di(?=\s+)/gu, match => match.startsWith('mezzo') ? 'mezzo dl di' : 'un dl di');
        line = replaceRegex(line, 'unità litri OCR: mezzo barra → mezzo l', /(?<![\p{L}])mezzo \|(?=\s+di\b)/gu, 'mezzo l');
    }

    // In frasi e alternative culinarie isolate, “0” è l'OCR della congiunzione
    // “o”. Si preservano i gradi di farina/tipo, le virgolette e i decimali.
    line = replaceRegex(line, 'congiunzione OCR 0 → o', /(?<![\p{L}\p{N}.])0(?![\p{L}\p{N}.])(?=,?(?:\s|$|[()[\]{};:!?]))/gu, (match, offset, whole) => {
        const before = whole.slice(0, offset);
        const after = whole.slice(offset + match.length);
        const previousWord = (before.match(/[\p{L}\p{N}]+\s*$/u) || [''])[0].trim().toLowerCase();
        const beforeQuote = before.slice(-1);
        const afterQuote = after.slice(0, 1);
        if (/(?:farina|tipo) 0 0 00/u.test(whole)) return match;
        if (previousWord === 'farina' || previousWord === 'tipo') return match;
        if (beforeQuote === '“' || beforeQuote === '"' || beforeQuote === "'" || afterQuote === '”' || afterQuote === '"' || afterQuote === "'") return match;
        if (!before.trim() || /[|]/u.test(before.slice(-1))) return match;
        return 'o';
    });

    line = replaceArticleBeforeNouns(line, '1', pluralIArticles, true);
    line = replaceArticleBeforeNouns(line, '11', ilArticles, true);
    line = replaceRegex(line, 'articolo OCR: 11 uova', /(?<![\p{L}\p{N}])11 (?=uova(?![\p{L}\p{N}-]))/gu, 'le ');
    line = replaceRegex(line, 'articolo OCR: 1 sale/vino', /(?<![\p{L}\p{N}])1 (?=(?:sale|vino)(?![\p{L}\p{N}-]))/gu, 'il ');
    line = replaceRegex(line, 'articolo OCR: fe olive', /(?<![\p{L}\p{N}])fe (?=olive(?![\p{L}\p{N}-]))/gu, 'le ');

    lines[index] = line;
}

const corrected = lines.join('\n');
if (corrected === markdown) {
    console.log('No unambiguous OCR corrections remain.');
    process.exit(0);
}

fs.writeFileSync(sourcePath, corrected, 'utf8');

const total = [...counters.values()].reduce((sum, value) => sum + value, 0);
console.log('Applied ' + total + ' unambiguous OCR corrections to ' + path.relative(repositoryRoot, sourcePath) + '.');
for (const [rule, count] of counters) {
    const example = examples.has(rule) ? ' (esempio: ' + examples.get(rule) + ')' : '';
    console.log('- ' + count + ' × ' + rule + example);
}
