"""Product type rules for FP&G products that have no product type (about 97,500
active products on 23 Oct 2026).

Charlie approved a 20-product sample first (sample-2026-10-23.csv, all were
blank before). Once he signs it off, run these rules over the untyped products
and write the result with a bulk operation (needs storage.googleapis.com
allowed for the upload) or in batches of ~50 productUpdate calls.

Rules are checked in order; the first match wins. Anything that matches
nothing is left blank for a person to decide, rather than guessed.

Usage: python3 -I rules.py "STIHL .325 Filing kit 56050071028 / 5605 007 1028"
"""
import re
import sys

RULES = [
    # Oils first, so "Chainsaw Chain Oil" is an oil, not a chain.
    (r'\b(chain oil|bar (and|&|an) chain oil)', 'Fuel & Oil'),
    # Sharpening before chains, so "saw chain round file" is a file, not a chain.
    (r'\b(round file|flat file|file holder|filing (kit|guide)|depth gauge|file gauge|sharpen)', 'Chainsaw Sharpening'),
    (r'\b(saw chain|chainsaw chain|chain loop|rapid (micro|super)|picco|\d{2,3} ?(links|dl)\b)', 'Chainsaw Chains'),
    (r'\b(guide ?bar|rollomatic|laminated bar|x-force|bar,? \d+ ?in)', 'Chainsaw Bar'),
    (r'\b(service kit|servicing kit)\b', 'Service Kit'),
    (r'\b(chainsaw boot|safety boot|boots?\b)', 'Chainsaw Boots'),
    (r'\bgloves?\b', 'Gloves'),
    (r'\b(trousers|chaps|leggings)\b', 'Trousers & Leg Protection'),
    (r'\b(helmet)\b(?!.*(visor|ear|hearing))', 'Helmet'),
    (r'\b(visor|face shield|mesh)\b', 'Helmet Accessories'),
    (r'\b(ear ?muffs?|hearing protect|ear defender)', 'Ear Protection'),
    (r'\b(jacket|hoodie|smock|fleece|t-shirt|shirt|sweatband|cap\b|overtrousers|rainsuit)', 'Workwear'),
    (r'\b(2 ?stroke|two stroke|4 ?stroke|chain oil|bar oil|motomix|fuel\b|alkylate|grease|lubricant|engine oil)', 'Fuel & Oil'),
    (r'\b(karabiner|carabiner|climbing rope|lanyard|sling|harness|pulley|hitch|throwline|prusik|rope grab|ascender|descender)', 'Climbing Equipment'),
    (r'\b(axe|hatchet|splitting maul|wedge|cant hook|breaking bar|lifting tongs)', 'Axes & Splitting Tools'),
    (r'\b(folding saw|pruning saw|hand saw|bow saw|sheathed saw|spare blade)', 'Hand Saws'),
    # Manufacturer part numbers: STIHL "1123 120 1601" or Husqvarna "545 13 98-03".
    (r'(\b\d{4} \d{3} \d{4}\b|\b\d{3} \d{2} \d{2}-\d{2}\b)', 'Spare Parts'),
]
COMPILED = [(re.compile(p, re.I), t) for p, t in RULES]


def product_type(title: str) -> str:
    for pattern, kind in COMPILED:
        if pattern.search(title):
            return kind
    return ''


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        print(f'{product_type(arg) or "(no rule)"}\t{arg}')
