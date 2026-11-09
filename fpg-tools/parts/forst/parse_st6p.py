"""Parts lists from the Forst ST6P user manual (Rev 3, 21/11/2018), pages 35-48.

Source: https://www.shc.co.uk/wp-content/uploads/2019/08/Forst-ST6P-Manual.pdf (Charlie, 9 Nov 2026).
Run with the manual's pages 36-50 saved as st6p-parts.pdf (page 1 = manual page 35).
Text tables are read from the PDF; the three tables printed as pictures (hopper tray,
top feed roller, flywheel) were read off the page by eye and are typed in below.
Writes st6p-parts.json: [{name, page, parts: [[ref, part no, description, qty]]}].
"""
import json
import re
import subprocess
import sys

import pdfplumber

SECTIONS = [
    (1, 'Hopper tray touch sensor'),
    (2, 'Chipping chamber'),
    (3, 'Chipping chamber: bottom feed'),
    (4, 'Chipping chamber: bottom feed & anvil'),
    (5, 'Chipping chamber: drive'),
    (6, 'Chipping chamber: flywheel drive'),
    (7, 'Chipping chamber: bottom feed roller cover'),
    (8, 'Chute'),
    (9, 'Top feed roller'),
    (10, 'Flywheel'),
    (11, 'Fuel tank'),
    (12, 'Hydraulic pump'),
    (13, 'Light board'),
    (14, 'Belt tensioner'),
]

TYPED = {
    1: [
        ('1', '12-30-017', 'Push to stop decal', 1),
        ('2', '24-19-058', 'Sensor trip bar fab assy', 1),
        ('3', '12-13-015', 'M6 nyloc nut ISO 7040', 2),
        ('4', '12-10-090', 'Buffer 15 x 20 M6', 2),
        ('5', '24-19-054', 'Sensor hopper tray fab assy', 1),
        ('6', '12-14-002', 'M16 Nylon Washer extra large OD 56 x 5 THK ISO 7094', 2),
        ('7', '12-14-005', 'M16 Washer ISO 7089', 2),
        ('8', '12-13-005', 'M16 nyloc nut ISO 7040', 2),
        ('9', '12-10-083', 'Forward/reverse touch sensor assy (Green)', 2),
        ('10', '12-14-020', 'M4 washer ISO 7089', 12),
        ('11', '12-14-027', 'M4 Serrated washer DIN 128', 12),
        ('12', '12-12-101', 'M4 x 20 Pan Head Pozi Screw', 12),
        ('13', '12-10-080', 'Stop touch sensor assy (Red)', 2),
        ('14', '22-01-008', 'Hopper tray hinge pin', 1),
        ('15', '12-14-024.1', 'M8 Serrated washer', 4),
        ('16', '12-12-401', 'M8 x 25 Lg 8.8 Hex Head screw', 4),
        ('17', '12-14-013', 'M8 washer ISO 7089', 4),
        ('18', '24-03-124', 'Cable cover / Trip mech guard', 1),
        ('19', '12-14-001', 'M16 Large washer', 2),
        ('20', '12-13-009', 'M16 Half nut', 2),
        ('21', '12-13-004', 'M16 Dome nut', 2),
        ('22', '12-10-072', 'Inductive proximity sensor kit (orange tip)', 1),
        ('21a', '12-10-071', 'Inductive proximity sensor kit (white tip)', 1),
        ('23', '12-10-084', 'Gas spring 22 DIA 50 stroke', 1),
        ('24', '12-14-017', 'M6 washer ISO 7089', 2),
    ],
    9: [
        ('1', '12-12-609', 'M12 x 45Lg 8.8 Socket Head Cap Screw', 2),
        ('2', '12-24-005', 'Hydraulic motor 199.6cc/rev', 1),
        ('3', '12-19-132-D', 'Feed motor bracket fab assy', 1),
        ('4', '12-19-133-D', 'Feed motor clamp', 1),
        ('4a', '12-03-201', 'Feed motor mount 3mm shim', 1),
        ('5', '12-12-308', 'M5 x 20Lg Skt. Head Cap Screw Zinc/Blk.', 4),
        ('6', '12-01-049', 'Rigid shaft coupling 25 ID', 1),
        ('7', '12-99-008.1', 'M10 Serrated Washer', 5),
        ('8', '12-14-009', 'M10 Washer ISO 7089', 5),
        ('9', '12-12-509', 'M10 x 35Lg 8.8 Hex Head screw', 2),
        ('10', '12-10-094', 'R1/8in BSPT 4mm male stud elbow', 2),
        ('11', '12-11-013', 'Self aligning flange bearing 2 hole 30 ID', 1),
        ('12', '12-03-102', 'Feed roller 2 hole bearing shim', 1),
        ('13', '24-01-052', 'Feed cheek RH 32mm slot', 1),
        ('14', '12-20-004', 'Rectangular key 30x8x7', 1),
        ('15', '24-19-064', 'Top feed roller and shaft', 1),
        ('16', '24-01-053', 'Feed cheek LH 32mm slot', 1),
        ('17', '12-03-042', 'Feed roller bearing shim', 1),
        ('18', '12-11-005', 'Self Aligning Flange Bearing 2Z 30 ID', 1),
        ('19', '12-12-502', 'M10 x 30Lg 8.8 Hex Head screw', 3),
        ('20, 21', '12-10-195', 'M14 spherical dished washer set', 1),
        ('22', '12-14-038', 'M14 Washer ISO 7089', 3),
        ('23', '12-13-018', 'M14 nyloc nut ISO 7040', 3),
        ('24', '12-13-011', 'M8 nyloc nut ISO 7040', 2),
        ('25', '12-14-013', 'M8 washer ISO 7089', 2),
        ('26', '22-02-002', 'Top feed roller stop', 1),
        ('27', '12-11-004', 'Plain bearing 20 ID, 26 OD, 28 flange x 12 Lg', 2),
        ('28', '12-01-008', 'Shoulder screw M16 x 14Lg', 4),
        ('29', '12-01-061', 'Feed adjuster collar', 2),
        ('30', '12-12-613', 'M12 x 140 eyebolt DIN 444', 2),
        ('31', '24-19-055', 'Top feed housing fab assy', 1),
    ],
    10: [
        ('1', '12-20-024', 'Rectangular key 40x14x9', 1),
        ('2', '24-01-051', 'Flywheel shaft', 1),
        ('3', '12-20-002', 'Rectangular key 90x14x9', 1),
        ('4', '12-01-046', 'Flywheel shaft spacer', 1),
        ('5', '12-13-007', 'M16 10.9 Hex nut ISO 4032', 6),
        ('6', '12-14-006', 'M16 serrated lock washer DIN 6798-A17', 6),
        ('7', '12-01-042', 'Flywheel machined assy', 1),
        ('8', '12-01-012', 'Flywheel shaft spacer', 1),
        ('9', '12-03-093.05', 'Blade shim 0.5mm', 2),
        ('10', '12-12-1102', 'M16 x 45Lg 10.9 CSK hex socket screw ISO 10642', 4),
        ('11', '12-01-009', 'Flywheel blade', 2),
        ('12', '12-12-1103', 'M16 x 50Lg 8.8 Hex Head screw cone point DIN 564', 2),
        ('', '12-03-093.10', 'Blade shim 1mm', 0),
        ('', '12-03-093.15', 'Blade shim 1.5mm', 0),
        ('', '12-03-093.20', 'Blade shim 2mm', 0),
        ('', '12-03-093.25', 'Blade shim 2.5mm', 0),
        ('', '99-99-099', 'Blade bolt set (bolt, washer & nut)', 0),
    ],
}

ROW = re.compile(r'^(\d+[a-z]?(?:,\s*\d+)?)\s+(\d{2}\s*-\s*[0-9A-Z]+\s*-\s*[0-9A-Z.]+(?:-[A-Z])?)\s+(.+?)\s+(\d+)$')


def main(pdf_path):
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        for page, name in SECTIONS:
            if page in TYPED:
                rows = [list(r) for r in TYPED[page]]
            else:
                rows = []
                if page in (3, 13):
                    # Tables turned on their side: pdftotext reads those the right way round.
                    text = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-layout', pdf_path, '-'], capture_output=True, text=True).stdout
                else:
                    text = pdf.pages[page - 1].extract_text(x_tolerance=1.5)
                for line in text.splitlines():
                    m = ROW.match(line.strip())
                    if m:
                        ref, no, desc, qty = m.groups()
                        rows.append([ref.replace(' ', ''), re.sub(r'\s+', '', no), desc.strip(), int(qty)])
            if page == 13:
                # Printed under the table with no item number; item 3 (number plate) has no part number.
                # The manual prints 2a (right lens) as 12-10-252, the LED loom's number; the right lens is 12-10-251 (left is 249).
                rows = [[r[0], '12-10-251', r[2], r[3]] if r[0] == '2a' else r for r in rows]
                rows += [['', '12-10-252', 'LED loom complete', 1], ['', '12-10-253', 'Curly cable', 1], ['', '24-19-067', 'Light guards', 0]]
            out.append({'name': name, 'page': page + 34, 'parts': rows})
    return out


if __name__ == '__main__':
    data = main(sys.argv[1] if len(sys.argv) > 1 else 'st6p-parts.pdf')
    json.dump(data, open('st6p-parts.json', 'w'), indent=1)
    for s in data:
        print(s['page'], s['name'], len(s['parts']))
