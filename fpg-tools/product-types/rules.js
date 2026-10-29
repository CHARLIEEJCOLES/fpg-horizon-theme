// FP&G product type rules, run in the browser over storefront products that have
// no product type (29 Oct 2026). Tighter than rules.py: each type that feeds a
// smart collection (Chainsaw Chains, Chainsaw Bar, Helmet, Helmet Accessories,
// Ear Protection, Trousers & Leg Protection) needs strong evidence, and part words
// stop accessories and machine parts being mistaken for gear.
// First match wins; no match = left blank for a person.
/* eslint-disable */
var FPG_TYPE_RULES = (function () {
  var PART = /\b(assy|asm|assembly|gasket|bolt|screw|nut|washer|bearing|bracket|spring|seal|filter|pump|tank|cap|hose|pipe|valve|nipple|bush|shim|spacer|clip|pin|plug|cable|lever|housing|sprocket|clutch|carb|carburett?or|piston|cylinder|crank\w*|rivet|stud|grommet|o-ring|circlip|decal|label|sticker|idler|axle|tyre|tire|switch|relay|fuse|solenoid|loom|sensor|knob|grip|trigger|throttle|diaphragm|needle|gear|shaft|drum|coil|muffler|silencer|starter|recoil|pawl|flywheel)\b/i;
  var ARB = /^(TEUFELBERGER|PETZL|DMM|NOTCH|TREEHOG|CLIMBING TECHNOLOGY|ISC|MARLOW|ROPE LOGIC|C\.A\.M\.P|CAMP|STEIN|HARKIE|KONG|SKYLOTEC|EDELRID|BEAL|COURANT|ROCK EXOTICA|SINGING ROCK|YALE|KASK|CMI|BUCKINGHAM|WESSPUR|SAMSON|FORESTRY ACCESSORIES)$/i;
  var MACHINE_PARTS_VENDOR = /^(FERRIS|GREENMECH|ETESIA|TORO|STIGA|MASPORT|OREC|ALKO|AL-KO|KAWASAKI|BRIGGS|HONDA)$/i;

  function t(title, vendor) {
    var s = ' ' + title.replace(/\s+/g, ' ') + ' ';
    var v = (vendor || '').trim();

    // Fuel and oil (not the parts that hold or move it)
    if (/\b(chain ?oil|bar (and|&|an) chain oil|bar oil|saw ?chain oil|[24][- ]?stroke oil|two[- ]stroke oil|four[- ]stroke oil|engine oil|motomix|moto[- ]mix|alkylate|aspen [24]|gear ?oil|hydraulic oil|(10|15)w[- /]?(30|40)|sae ?30|multigrade|lubricant|bio ?oil|fuel mix|grease)\b/i.test(s)
      && !/\b(filter|seal|pump|tank|cap|hose|pipe|line|nipple|gun|gauge|valve|dipstick|cooler|level|strainer|o-ring|gasket|screw|bolt|bracket|cover|plug|pick-?up|bottle holder|measure|jug|funnel|spout|can\b|canister|ring|cup|label|footwear|boot)/i.test(s)) return 'Fuel & Oil';

    // Chainsaw sharpening tools
    if (/\b(round files?|flat files?|chainsaw files?|saw ?chain (round )?files?|file holders?|file handles?|filing (kit|guide|vice|jig|gauge)|depth gauge (tool|guide|jointer|setter)|open end depth gauge|file gauge|sharpening (kit|tool|guide|stone|set|jig)|chain sharpener|chain grinder|grinder for saw ?chains?|2[- ]in[- ]1 (file|sharpener)|powersharp|filing kit)\b/i.test(s)
      && !/\b(axe|gaff|stone|whetstone|3-in-1)\b/i.test(s)) return 'Chainsaw Sharpening';
    if (/\bguide bar leveller\b/i.test(s)) return 'Chainsaw Sharpening';

    // Saw chain loops and reels (not chain brakes, catchers, covers, roller chain)
    var chainy = /\b(saw ?chain|chainsaw chain|chain loop|chain reel|rapid (micro|super|duro|hexa)|picco|micro ?lite|(super|semi|full)[- ]?chisel|harvester chain)\b/i.test(s)
      || (/\bchain\b/i.test(s) && /(\.325|3\/8|\.404|1\/4)/.test(s) && /(\b0?\.0(43|50|58|63)\b|\b1[.,][1356] ?mm\b|\b\d{2,3} ?(dl|drive ?links?|links?)\b|\b\d{2,3}E\b)/i.test(s));
    if (chainy && !/\b(roller chain|#\d{2}|catcher|brake|tension|sprocket|cover|guard|sharpen|file|grinder|oil\b|kit|bar & chain|bar and chain|breaker|spinner|rivet|link(s)? (and|&) rivets|preseparator|pre-separator|joiner|tie strap|drive link)\b/i.test(s)
      && !MACHINE_PARTS_VENDOR.test(v)) return 'Chainsaw Chains';

    // Guide bars (not bar covers, nose sprockets or bar & chain kits)
    if (/\b(guide ?bars?|rollomatic|laminated bar|light ?04 bar|x-force bar|power ?match bar|speed ?star bar|pro[- ]?lite bar|advance cutting bar)\b/i.test(s)
      && !/\b(cover|scabbard|nose|sprocket|rivet|bolt|nut|plate|stud|oil|lube|chain\b|kit|bag|guard|clamp|dresser|groove|cleaner|gauge|leveller|bracket|comp)\b/i.test(s)) return 'Chainsaw Bar';

    // Service kits
    if (/\b(service kit|servicing kit|tune[- ]?up kit)\b/i.test(s)) return 'Service Kit';

    // PPE: hearing first (so "hearing protectors for helmets" is ear protection)
    if (/\b(ear ?muffs?|ear ?defenders?|hearing protect(ion|ors?)|ear ?plugs?|optime|litecom|ws alert)\b/i.test(s)
      && !/\b(hygiene|cushion|pads?|replacement|spare|foam|seal|kit for|cable|lead|charger|charging|battery)\b/i.test(s)) return 'Ear Protection';

    if (/\bvisor assembl/i.test(s)) return 'Visor Assemblies';
    if (/\b(visors?|face ?shields?|helmet (bag|holder|light|lamp|liner|sweatband|chin ?strap|sticker|mount|clip|adaptor|adapter|hook)|chin ?straps?|sweatbands?|(neck guard|nape protector|absorbent foam|integrated glasses)\b.*\bhelmets?)\b/i.test(s)
      && !MACHINE_PARTS_VENDOR.test(v) && !/\b(mower|tractor|deck|cab)\b/i.test(s)) return 'Helmet Accessories';
    if (/\bhelmets?\b/i.test(s)
      && !/\b(visor|ear|hearing|muff|defender|bag|holder|hook|sticker|decal|liner|sweat|strap|adapt|clip|mount|cover|lamp|light|torch|hygiene|pad|cushion|comms|headset|bluetooth|insert|spare|replacement|accessor|for|peak|lanyard|net|mesh|guard|foam|nape|glasses|toy|kids|keyring)\b/i.test(s)) return 'Helmet';

    // Chainsaw boots (not laces, socks or care products)
    if ((/\bchainsaw (protective |safety )?boots?\b/i.test(s) || (/\bboots?\b/i.test(s) && /\b(class [123]|chainsaw|cut[- ]?protect|saw protection)\b/i.test(s)))
      && !/\b(lace|sock|insole|wax|dubbin|polish|spray|dryer|cover|gaiter|bag|care)\b/i.test(s)) return 'Chainsaw Boots';

    // Gloves
    if (/\bgloves?\b/i.test(s) && !/\b(clip|holder|hook|dispenser|box of|liner)\b/i.test(s)) return 'Gloves';

    // Protective trousers and chaps (work and waterproof trousers are Workwear)
    if ((/\b(chainsaw|brushcutter|strimmer) (trousers|chaps|leggings|bib)\b/i.test(s) || /\bchaps\b/i.test(s)
      || (/\b(trousers|bib (and|&) brace|leggings)\b/i.test(s) && /\b(class [123]|design [ac]|type [ac]|d[ac] ?cl ?[123]|chainsaw|cut[- ]?protect|saw protection|protective)\b/i.test(s)))
      && !/\b(rain|water ?proof|over ?trousers|braces|belt|non-protective)\b/i.test(s)) return 'Trousers & Leg Protection';

    // Workwear
    if (/\b(jackets?|hoodie|hooded|smock|fleece|t-shirts?|tee|polo|shirts?|sweatshirt|gilet|body ?warmer|softshell|rainsuit|rain ?coat|over ?trousers|waterproof trousers|work trousers|cargo trousers|beanie|snood|base ?layer|socks|hi[- ]?vis(ibility)? (vest|jacket|waistcoat|coat)|non-protective trousers)\b/i.test(s)
      && !/\b(water jacket|cooling jacket|jacket (bolt|clamp|pipe)|hose)\b/i.test(s) && !/\btee,/i.test(s) && !MACHINE_PARTS_VENDOR.test(v)) return 'Workwear';

    // Climbing and rigging
    var climb = /\b(karabiners?|carabiners?|climbing (rope|line|harness|spikes?|gaffs?|spurs?|kit)|arborist (rope|harness|saddle)|lanyards?|fliplines?|friction (saver|cord)|cambium savers?|throw ?lines?|throw ?(bag|weight|cube)|prusik|hitch ?(cord|climber|tender)|rope ?(grab|wrench|guide|runner)|ascenders?|descenders?|lowering device|rigging (rope|plate|block|pulley|ring|sling|line)|whoopie|dead ?eye|split ?tail|eye to eye|sit harness|work positioning|positioning lanyard|tree ?motion|sequoia harness)\b/i.test(s);
    if (!climb && ARB.test(v) && /\b(pulleys?|slings?|ropes?|harness(es)?|swivels?|rings?|blocks?|loops?|cords?|connectors?|snap ?hooks?|maillon|quick ?links?)\b/i.test(s)) climb = true;
    if (climb && !MACHINE_PARTS_VENDOR.test(v) && !/^(ECHO|STIHL)$/i.test(v) && !/\b(brushcutter|strimmer|trimmer|wiring|spike kit|bumper|merchandise|toys)\b/i.test(s) && !PART.test(s.replace(/\b(rings?|cords?|pulleys?|grip)\b/gi, ''))) return 'Climbing Equipment';

    // Axes and splitting tools
    if (/\b(axes?|hatchets?|splitting mauls?|mauls?|felling wedges?|splitting wedges?|cant ?hooks?|peavey|breaking bars?|felling levers?|lifting (tongs|hooks?)|timber tongs|sappie|pickaroon|hookaroon|log ?(tongs|lifters?))\b/i.test(s)
      && !/\b(sharpen|stone|grindstone|handle only|replacement handle|handle for|ash handle|sheath|holder|holster|cover|guard|fencing|collar|screws)\b/i.test(s)) return 'Axes & Splitting Tools';

    // Hand saws
    if (/\b(folding saws?|pruning saws?|hand ?saws?|bow ?saws?|pocketboy|gomtaro|zubat|hayauchi|ibuki|bigboy|katanaboy|sugoi|natanoko|tsurugi|ultra ?accel|super ?accel)\b/i.test(s)
      && !/\b(chainsaw|holster|sheath|scabbard|holder|mount|hook|to fit|for)\b/i.test(s)) return 'Hand Saws';

    // Spare parts: manufacturer part numbers
    // Whole machines and accessories that only look like parts (model codes) stay blank
    var MACHINE = /\b(chainsaw|hedge ?(trimmer|cutter)|blower|brush ?cutter|pole (pruner|saw)|strimmer|line trimmer|vacuum|mower|tiller|cultivator|sprayer|power ?head|pressure washer|shredder|split ?boom|cutting saw|consaw|multi-tool|lawn ?mower|trimmer(?! head)|chain saw|demo station|\d{2}v|\d{2}e?force)\b/i;
    if (MACHINE.test(s) && !PART.test(s)) return '';
    if (/\b(filter bags?|pipe cleaning|high[- ]pressure hose|suction hose|vacuum hose|upgrade kit|surface cleaner|lance|nozzle|nylon (line|cord)|extension|battery|batteries|charger)\b/i.test(s)) return '';
    if ((/\b\d{4} \d{3} \d{4}\b/.test(s) || /\b\d{3} \d{2} \d{2}-\d{2}\b/.test(s)) && PART.test(s) && !/\b(toy|kids|keyring|mug|cap\b.*\b(baseball|peak)|merchandise)\b/i.test(s)) return 'Spare Parts';
    if (/^ECHO$/i.test(v) && /^ ?ECHO\b/i.test(title) && (/\b([A-Z]\d{3}-\d{6}|\d{5}-\d{4,5}-\d{1,2}|\d{6}-\d{5}|\d{5,6}|[A-Z]{1,3}-\d{3,}[A-Z0-9-]*|\d{11})\b/.test(s))) return 'Spare Parts';
    if (/^(STIHL)$/i.test(v) && /\b\d{11}\b/.test(s) && PART.test(s)) return 'Spare Parts';
    if (/^(HUSQVARNA)$/i.test(v) && /\b5\d{8}\b/.test(s) && PART.test(s)) return 'Spare Parts';
    return '';
  }
  return { type: t };
})();
