"""Extract this specific scoring guide, preserving original figures and wording.

Usage: python scripts/extract_pdf.py /path/to/FILE_2835.pdf
Requires PyMuPDF and Pillow. The source PDF is never changed.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

import pymupdf as pdf
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'questions'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('pdf')
args = parser.parse_args()
source = pdf.open(args.pdf)
clean = pdf.open(args.pdf)
TOP, BOTTOM = 70, 760

# These exact colors are the scoring guide's correct-answer background,
# border, and check mark. Replace their paint colors before rendering.
for page in clean:
    for xref in page.get_contents():
        stream = clean.xref_stream(xref)
        stream = re.sub(rb'\.902 1 \.902 (rg|RG)', rb'1 1 1 \1', stream)
        stream = re.sub(rb'\.2275 \.5686 \.2471 (rg|RG)', rb'1 1 1 \1', stream)
        clean.update_stream(xref, stream)

blocks = []
starts = []
option_markers = []
for pi, page in enumerate(source):
    for b in page.get_text('dict')['blocks']:
        for line in b.get('lines', []):
            for span in line['spans']:
                m = re.match(r'^\(([A-E])\)', span['text'].strip())
                if m and 65 < span['bbox'][0] < 80:
                    option_markers.append({'p':pi, 'y':span['bbox'][1], 'bottom':span['bbox'][3],
                                           'x':span['bbox'][0], 'letter':m[1]})
    for b in page.get_text('blocks'):
        if b[1] < 65 or b[1] >= BOTTOM:
            continue
        item = {'p': pi, 'y': b[1], 'bottom': b[3], 'x': b[0], 'text': b[4]}
        blocks.append(item)
        m = re.match(r'^(\d+)\.\n', b[4])
        if m and b[0] < 45:
            starts.append({'id': int(m[1]), 'p': pi, 'y': b[1] - 3})
starts.sort(key=lambda s: s['id'])
assert [s['id'] for s in starts] == list(range(1, 127))
# Q35's diagram is above its printed number.
starts[34]['y'] = TOP

def key(item):
    return item['p'], item['y']

def between(a, b):
    return [v for v in blocks if key(a) <= key(v) < key(b)]

def crops(a, b, prefix, original=False, left=36, right=576):
    result = []
    doc = source if original else clean
    for pi in range(a['p'], b['p'] + 1):
        y0 = a['y'] if pi == a['p'] else TOP
        y1 = b['y'] if pi == b['p'] else BOTTOM
        if y1 - y0 < 2:
            continue
        # Only trim exterior whitespace; figures and tables remain intact.
        clip = pdf.Rect(left, y0, right, y1)
        pix = doc[pi].get_pixmap(matrix=pdf.Matrix(2.4, 2.4), clip=clip, alpha=False)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        from PIL import ImageChops
        bbox = ImageChops.difference(im, Image.new('RGB', im.size, 'white')).getbbox()
        if not bbox:
            continue
        # Preserve common horizontal alignment, trimming vertically only.
        im = im.crop((0, max(0, bbox[1]-8), im.width, min(im.height, bbox[3]+8)))
        name = f'{prefix}-p{pi+1}.webp'
        im.save(OUT / name, 'WEBP', lossless=True)
        result.append({'src': f'assets/questions/{name}', 'width': im.width, 'height': im.height,
                       'page': pi+1, 'text': doc[pi].get_text('text', clip=clip).strip()})
    return result

shared = {}
for first, last in [(16,20), (41,44), (48,50)]:
    start = starts[first-1]
    images = crops({'p':start['p'], 'y':TOP}, start, f'context-{first}')
    for number in range(first,last+1):
        shared[number] = images

questions = []
audit = []
for ix, start in enumerate(starts):
    number = start['id']
    end = starts[ix+1] if ix+1 < len(starts) else {'p':154, 'y':BOTTOM}
    # Shared passages belong to their following group, not the previous answer.
    if ix+1 < len(starts) and starts[ix+1]['id'] in (16,41,48):
        end = {**end, 'y':TOP}
    section = between(start, end)
    kind = 'mcq' if number <= 95 else 'frq'
    q = {'id':number, 'type':kind, 'page':start['p']+1, 'context':shared.get(number, [])}
    if kind == 'mcq':
        options = [v for v in option_markers if key(start) <= key(v) < key(end)]
        assert ''.join(o['letter'] for o in options) in ('ABCD','ABCDE'), (number,options)
        answers = [v for v in section if re.match(r'^Answer [A-E]',v['text'])]
        highlighted = []
        for o in options:
            for d in source[o['p']].get_drawings():
                c = d.get('fill')
                if c and abs(c[0]-.902)<.001 and abs(c[1]-1)<.001 and abs(c[2]-.902)<.001:
                    if d['rect'].x0 < 80 and abs(d['rect'].y0-o['y']) < 1:
                        highlighted.append(o['letter'])
                        break
        assert len(highlighted)==1, (number,highlighted)
        correct = highlighted[0]
        if answers:
            assert answers[0]['text'].strip() == 'Answer '+correct, number
            # Exclude the gray explanation box's top padding.
            answer_start = {**answers[0], 'y':answers[0]['y']-12}
        else:
            answer_start = end
        q['prompt'] = crops(start, {**options[0],'y':options[0]['y']-3}, f'q{number}-prompt')
        q['options'] = []
        for oi,o in enumerate(options):
            stop = options[oi+1] if oi+1<len(options) else answer_start
            imgs = crops({**o,'y':o['y']-1}, {**stop,'y':stop['y']-2}, f'q{number}-{o["letter"]}', left=68, right=576)
            # Keep text alternatives for accessibility, with exact image as authority.
            text = ' '.join(img['text'] for img in imgs).strip()
            text = re.sub(r'^\([A-E]\)\s*','',text)
            graphical = not text
            for pi in range(o['p'], stop['p']+1):
                region = pdf.Rect(90, o['y']-1 if pi==o['p'] else TOP, 576, stop['y']-2 if pi==stop['p'] else BOTTOM)
                if region.is_empty:
                    continue
                for info in source[pi].get_image_info():
                    if pdf.Rect(info['bbox']).intersects(region):
                        graphical = True
                for d in source[pi].get_drawings():
                    rect = d['rect']
                    c = d.get('fill')
                    scoring_color = c and (abs(c[0]-.902)<.001 or abs(c[0]-.2275)<.001 or abs(c[0]-.898)<.001)
                    if not scoring_color and rect.width > 3 and rect.height > 3 and region.contains(rect):
                        graphical = True
            q['options'].append({'letter':o['letter'],'text':text,'images':imgs,'graphical':graphical})
        q['correct'] = correct
        q['explanation'] = crops(answer_start, end, f'q{number}-explanation',original=True) if answers else []
        audit.append({'id':number,'correct':correct,'verifiedBy':'highlight and written key' if answers else 'highlight','options':len(options)})
    else:
        rubric = next((v for v in section if v['x'] < 45 and re.match(r'^(Part [A-D]|General)\b',v['text'])),None)
        assert rubric, number
        split = {**rubric,'y':rubric['y']-4}
        q['prompt'] = crops(start, split, f'q{number}-prompt')
        q['rubric'] = crops(split, end, f'q{number}-rubric',original=True)
        audit.append({'id':number,'rubricPage':rubric['p']+1,'rubricY':round(rubric['y'],2),'promptPages':len(q['prompt'])})
    if number in (36,37):
        q['note'] = 'The supplied PDF refers to models 1–3 here but does not include those model illustrations.'
    assert q['prompt'], number
    questions.append(q)

data = {'title':'AP Biology Practice', 'source':'FILE_2835.pdf', 'sourcePages':155,
        'sourceSha256':hashlib.sha256(Path(args.pdf).read_bytes()).hexdigest(), 'questions':questions}
(ROOT/'questions.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
(ROOT/'scripts'/'extraction-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(f'Extracted {len(questions)} questions: 95 MCQs and 31 FRQs. All 95 keys verified against source highlighting.')
