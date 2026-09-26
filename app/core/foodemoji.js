// Emoji de cada alimento (como Fitia): primero por palabras del nombre, que es lo más
// preciso ("Milanesa de pollo" → 🍗 aunque esté en "Comidas y congelados"); si no hay
// ninguna, por la categoría de la base de alimentos; si tampoco, un plato.
import { FOODS } from './data.js';
import { norm } from './utils.js';

// El orden importa: lo más específico primero (helado de chocolate → 🍦, no 🍫). Se
// busca en el nombre sin tildes, entre espacios y sin "sin azúcar" / "sin TACC" (para que
// "Gaseosa sin azúcar" no dé 🍯).
const RULES = [
  // Lo que empieza por su nombre de producto (manda sobre el resto de las palabras)
  [/^ huevo (?!de chocolate|kinder)/, "🥚"], [/^ (alfajor|pepas?)\b/, "🍪"], [/^ omelet/, "🍳"], [/^ pan\b/, "🍞"], [/aceite de oliva|aceituna/, "🫒"],
  [/^ (aceite|grasa)\b|mayonesa|salsa de soja/, "🫙"], [/soja texturizada/, "🫘"],
  [/cerveza|birra/, "🍺"], [/\bvino\b|champagne|espumante|sidra|fernet|vermut|aperitivo|aperol|campari|whisky|vodka|\bron\b|\bgin\b|tequila|licor|daiquiri|trago|clerico|cuba libre|destornillador|gancia|cynar|pina colada/, "🍷"],
  // Platos y preparaciones (mandan sobre sus ingredientes)
  [/\bflan\b|\bpostre\b|mousse|arroz con leche|crema pastelera|\bpudding\b|budin de pan/, "🍮"],
  [/pastafrola|\btarta\b|pascualina|quiche|\btartas?\b|pastel de papa/, "🥧"],
  [/panqueque|\bcrepes?\b/, "🥞"], [/waffle|wafle/, "🧇"], [/muffin|cupcake|magdalena/, "🧁"],
  [/helad|palito bombon|cucurucho|milkshake|yogur helado|mcflurry|sundae|king fusion|^ cono\b|crocantino|almendrado|bombon escoces/, "🍦"],
  [/\btorta\b|budin|brownie|lemon pie|chocotorta|cheesecake|bizcochuelo|pionono|tiramisu|milhojas/, "🍰"],
  [/\bdonas?\b|donut/, "🍩"], [/medialuna|factura|croissant|churro|pastelito|librito|cremona|figacita|fosforito/, "🥐"],
  [/tortilla de grasa|tortas? fritas?|galleta de campo|galleta marinera/, "🫓"], [/pan de carne/, "🥩"],
  [/pizza|fugazza|fugazzeta|pizzeta|calzone|prepizza/, "🍕"],
  [/big mac|cuarto de libra|hamburgues|burger|whopper|stacker|cheese|mcnifica|grand tasty|mcbacon|mcmelt|mcpollo|mccrispy|long chicken|doble carne|mega (clasico|taste)/, "🍔"], [/pancho|salchicha|hot ?dog/, "🌭"],
  [/shawarma|kebab|doner/, "🥙"], [/humita en chala|\btamal/, "🫔"],
  [/empanad|canelon|raviol|sorrentino|capelet|tortelin|agnolotti|tapas para empanadas/, "🥟"],
  [/^ sub |twister|sandwich|sanguche|\btostado (de|jyq|jamon)|\bwrap\b|choripan|morcipan|\bal pan\b|\ben pan\b|lomito completo/, "🥪"],
  [/\btacos?\b|burrito|quesadilla|fajita|nacho|dorito/, "🌮"], [/sushi|\broll\b|sashimi|niguiri/, "🍣"],
  [/ensalada de frutas|coctel de frutas|coctel de fruta/, "🍓"], [/ensalada/, "🥗"],
  [/\bsopa\b|caldo|guiso|locro|puchero|estofado|carbonada|cazuela|maiz pisado/, "🍲"],
  [/lasana|lasagna/, "🍝"], [/provoleta/, "🧀"],
  [/milanesa de (soja|berenjena|calabaza|zapallo|quinoa|lentejas?|garbanzos?)|seitan|tempeh|medallon de (lentejas|vegetales)/, "🥗"],
  // Bebidas
  [/licuado|batido|shake|smoothie/, "🥤"], [/submarino|chocolatada/, "🍫"],
  [/\bmate\b|terere/, "🧉"], [/\bcafe\b|capuchino|cappuccino|macchiato|lagrima|cortado|espresso|latte|\bte\b|infusion/, "☕"],
  [/gaseosa|\bcoca\b|pepsi|sprite|fanta|\bsoda\b|\bjugo\b|agua saborizada|agua tonica|isotonic|energizante|gatorade|powerade|limonada|kombucha/, "🥤"],
  [/^ agua\b/, "💧"],
  // Suplementos
  [/omega|capsula|vitamina|multivitam/, "💊"], [/barra proteica|barrita/, "🍫"],
  [/whey|proteina|scoop|creatina|colageno|caseina|glutamina|bcaa|pre-entreno|ganador de peso|maltodextrina|gel energetico/, "🥤"],
  // Dulces y snacks
  [/alfajor|galletit|galleta|oreo|cookie|chocolin|oblea|vainillas?\b/, "🍪"],
  [/chupetin/, "🍭"], [/pochoclo|chizito|palitos salados|\bsnack\b|tutuca/, "🍿"],
  [/chocolat|cacao|nutella|bon ?o ?bon|rhodesia|cofler|mantecol/, "🍫"],
  [/caramelo|chicle|gomita|golosina|turron|garrapinada|malvavisco|confite|merengue/, "🍬"],
  [/pasta de mani|mantequilla de mani|crema de mani/, "🥜"],
  [/dulce de|mermelada|jalea|\bmiel\b|azucar|edulcorante|^ almibar|melaza/, "🍯"],
  // Lácteos y huevos
  [/\bleche\b|kefir/, "🥛"], [/yogur|actimel|danonino/, "🥣"],
  [/queso|ricota|requeson|mozzarella|muzzarella|cheddar/, "🧀"],
  // Carnes y pescados
  [/\bpollo\b|pechuga|pata muslo|suprema|\bpavo\b|pavita|alitas|nugget|\bpato\b|codorniz/, "🍗"],
  [/pescado|merluza|salmon|atun|trucha|abadejo|sardina|caballa|marisco|camaron|langostino|calamar|mejillon|brotola|pejerrey|tilapia|kani|rabas|pulpo|almeja|vieira|centolla|cornalito|anchoita|ceviche|paella/, "🐟"],
  [/\bbife\b|asado|\bvacio\b|matambre|churrasco|albondiga|\btuco con carne/, "🥩"],
  [/jamon|salame|salamin|bondiola|mortadela|fiambre|panceta|bacon|leberwurst|chorizo|morcilla|cantimpalo|pastron|longaniza|salchichon/, "🥓"],
  [/carne|nalga|peceto|cuadril|\blomo\b|entrana|milanesa|picada|costilla|cerdo|solomillo|cordero|osobuco|higado|rinon|chinchulin|molleja|mondongo|\blengua\b/, "🥩"],
  // Harinas y cereales
  [/arroz|risotto/, "🍚"],
  [/fideo|\bpasta\b|spaghetti|tallarin|mostachol|tirabuzon|noqui|hojaldre/, "🍝"],
  [/\bpan\b|tostadas? de|galleta de arroz|grisin|bizcoch|chipa|baguette|bagel|pebete|\bmiga\b|tortita|criollita|scon|ciabatta|brioche|rapidita/, "🍞"],
  [/avena|granola|cereal|copos|muesli|quinoa|polenta|salvado|trigo|burgol|harina|semolin|cous cous|mijo|cebada|amaranto|fecula|premezcla/, "🌾"],
  // Verduras y frutas
  [/tomate|filetto|\bsalsa (de tomate|pomarola|filetto)/, "🍅"],
  [/\bpapas?\b|batata|mandioca|\bpure\b|croqueta/, "🥔"], [/huevo|clara|yema|omelet|tortilla|revuelto/, "🥚"],
  [/choclo|\bmaiz\b/, "🌽"], [/palta|aguacate|guacamole/, "🥑"], [/zanahoria/, "🥕"],
  [/lechuga|espinaca|acelga|rucula|kale|\brepollo\b|repollo|radicheta/, "🥬"], [/brocoli|coliflor|brote/, "🥦"], [/berenjena/, "🍆"],
  [/pepino|pepinillo|zapallito|zucchini|calabacin/, "🥒"], [/morron|pimiento|\baji\b|jalapeno/, "🫑"], [/cebolla|\bajo\b|puerro|verdeo|echalote|alioli/, "🧅"],
  [/zapallo|calabaza|\banco\b|cabutia/, "🎃"], [/hongo|champinon/, "🍄"], [/aceite de oliva|aceituna/, "🫒"],
  [/lenteja|garbanzo|poroto|arveja|\bsoja\b|tofu|edamame|hummus|\bhabas\b|faina/, "🫘"],
  [/\bmani\b|almendra|\bnuez\b|nueces|castana|avellana|pistacho|semilla|\bchia\b|\blino\b|girasol|sesamo|frutos secos|pinon|nucrem/, "🥜"],
  [/pasas de uva/, "🍇"], [/banana/, "🍌"], [/manzana/, "🍎"], [/\bperas?\b|membrillo/, "🍐"], [/naranja|mandarina|pomelo/, "🍊"], [/\blimon\b|\blima\b/, "🍋"],
  [/frutilla|fresa/, "🍓"], [/\buvas?\b/, "🍇"], [/sandia/, "🍉"], [/melon/, "🍈"], [/anana|\bpina\b/, "🍍"],
  [/durazno|damasco|pelon|orejon/, "🍑"], [/cereza/, "🍒"], [/kiwi/, "🥝"], [/mango|papaya|mamon|maracuya/, "🥭"], [/arandano|frutos rojos|\bmoras?\b|frambuesa/, "🫐"],
  [/\bcoco\b/, "🥥"], [/manteca|margarina|ghee/, "🧈"],
  [/\baceite\b|\bgrasa\b|mayonesa|ketchup|mostaza|\bsalsa\b|aderezo|vinagre|aceto|chimichurri|provenzal/, "🫙"],
];

const CAT = {
  "Lácteos": "🥛", "Quesos": "🧀", "Huevos": "🥚", "Carne vacuna": "🥩", "Cerdo": "🥩", "Cordero y cabrito": "🍖", "Pollo y aves": "🍗",
  "Pescados y mariscos": "🐟", "Fiambres y embutidos": "🥓", "Verduras": "🥦", "Frutas": "🍎", "Legumbres": "🫘",
  "Cereales, harinas y pastas": "🌾", "Pastas frescas y rellenas (cocidas)": "🍝", "Panificados": "🍞",
  "Aceites, aderezos y untables": "🫙", "Frutos secos y semillas": "🥜", "Dulces y azúcares": "🍯",
  "Golosinas y snacks": "🍫", "Helados y postres": "🍨", "Bebidas": "🥤", "Bebidas con alcohol": "🍷",
  "Suplementos": "🥤", "Vegetariano y sin TACC": "🥗", "Comidas y congelados": "🍽️",
};

let byName = null;
function catOf(name) {
  if (!byName) { byName = new Map(); (FOODS || []).forEach(f => { if (f && f.name) byName.set(f.name, f.cat); }); }
  // Lo anotado con crudo/cocido lleva " (crudo)" / " (cocido)" al final del nombre.
  return byName.get(String(name || "").replace(/ \((crudo|cocido)\)$/, "")) || null;
}

const memo = new Map();
export function foodEmoji(name, cat) {
  const key = name + "|" + (cat || "");
  if (memo.has(key)) return memo.get(key);
  const full = " " + norm(String(name || "")).replace(/\bsin (azucar|tacc|alcohol|piel|sal)\b/g, "")
    .replace(/\(([^()]*,\s*)?(mcdonald'?s|burger king|mostaza|kfc|subway|starbucks|mccafe|grido|sbarro|el noble)\b[^()]*\)/g, " ") + " ";
  // En "Avena con leche" o "Arroz con pollo" manda lo que va antes del "con".
  const head = full.split(/ \(?con /)[0] + " ";
  const match = n => { for (const [re, em] of RULES) if (re.test(n)) return em; return null; };
  let e = match(head) || match(full);
  if (!e) e = CAT[cat || catOf(name)] || "🍽️";
  memo.set(key, e);
  return e;
}
