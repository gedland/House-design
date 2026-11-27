# Lager teksturene i denne mappen fra Poly Haven (CC0, polyhaven.com). Kjøres bare når teksturene skal byttes:
#   python3 textures/lag.py
# Laster ned 1k JPG (farge, normal gl, ARM) og skriver <navn>_color.webp, _normal.webp og _arm.webp (R = AO, G = ruhet, B = 0).
# Fargekartet deles på sin egen gjennomsnittsfarge, så fargen i husets JSON bestemmer fargen og teksturen gir mønsteret.
# Skriver til slutt linjene til TEXTURES i js/scene.js: [størrelse i meter, forsterkning, snittruhet].
import io, json, os, urllib.request
import numpy as np
from PIL import Image
OUT = os.path.dirname(os.path.abspath(__file__))
# nøkkel i MATERIALS: (Poly Haven-id, størrelse i meter, kontrast, metning, rotasjon i grader)
M = {
  'eik': ('wood_floor', 1.7, 1, 1, 0), 'furu': ('wood_floor_worn', 2.0, 1, 1, 0), 'parkett_hvit': ('laminate_floor_02', 1.7, .9, .8, 0),
  'flis_hvit': ('floor_tiles_08', 1.5, .45, .3, 0), 'flis_gra': ('large_floor_tiles_02', 3.0, .7, .4, 0),
  'mikrosement': ('smooth_concrete_floor', 2.0, .5, .3, 0), 'puss': ('white_stucco_02', 1.8, .8, .3, 0), 'maling': ('painted_plaster_wall', 2.0, .4, .2, 0),
  'panel_hvit': ('white_planks_clean', 1.8, .7, .4, 0), 'panel_beiset': ('wood_plank_wall', 1.0, 1, 1, 90),  # stående bord
  'tegl': ('large_red_bricks', 2.0, .9, .8, 0), 'betongtakstein': ('roof_tiles_14', 1.5, .8, .4, 0), 'skifer': ('grey_roof_tiles_02', 1.5, .9, .5, 0),
  'betong': ('concrete_wall_008', 2.7, .8, .4, 0), 'stoff': ('rough_linen', .27, .8, .5, 0), 'laer': ('brown_leather', .4, .9, .7, 0),
}
lin = lambda s: np.where(s <= .04045, s / 12.92, ((s + .055) / 1.055) ** 2.4)
srgb = lambda l: np.where(l <= .0031308, l * 12.92, 1.055 * np.clip(l, 0, None) ** (1 / 2.4) - .055)
get = lambda url: urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'husform-teksturer'})).read()
save = lambda a, name, q: Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8)).save(os.path.join(OUT, name), quality=q, method=6)
rows = []
for key, (id, size, contrast, sat, rot) in M.items():
    files = json.loads(get(f'https://api.polyhaven.com/files/{id}'))
    def load(k):
        im = Image.open(io.BytesIO(get(files[k]['1k']['jpg']['url']))).convert('RGB').resize((1024, 1024), Image.LANCZOS)
        return np.asarray(im.rotate(rot) if rot else im, dtype=np.float64) / 255
    c = lin(load('Diffuse')); mean = c.reshape(-1, 3).mean(0)
    x = c / mean                                            # snitt 1 i hver kanal
    L = (x * [.2126, .7152, .0722]).sum(2, keepdims=True)
    x = 1 + (L + (x - L) * sat - 1) * contrast              # mindre fargevariasjon og kontrast, så JSON-fargen stemmer
    k = min(.85, .98 / np.percentile(x, 99.7))              # så lyst som mulig uten å klippe
    save(srgb(np.clip(x * k, 0, 1)), f'{key}_color.webp', 80)
    n = load('nor_gl')
    if rot == 90: n = np.stack([1 - n[..., 1], n[..., 0], n[..., 2]], 2)  # roterte normaler: x' = -y, y' = x
    save(n, f'{key}_normal.webp', 85)
    a = load('arm'); save(np.stack([a[..., 0], a[..., 1], np.zeros_like(a[..., 0])], 2), f'{key}_arm.webp', 85)
    rows.append(f'{key}: [{size:g}, {1 / k:.3f}, {a[..., 1].mean():.3f}]'); print(rows[-1])
print('\nTEXTURES:', ', '.join(rows))
