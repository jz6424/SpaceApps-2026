# Writes the Connecting Ridge elevations as raw metres for the browser game, from the same NASA
# crop as nasa-data/ridge_best. heightmap.png has only 256 grey levels (1.38 m per level), which
# shows up as terraces at walking scale, so the game reads these floats instead.
# Output: 512 x 512 little-endian float32, row by row, metres above the lowest point.
import json
import os

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "..", "nasa-data")
OUT = os.path.join(HERE, "..", "public", "terrain", "ridge_heights.f32")

meta = json.loads(open(os.path.join(SITE, "ridge_best", "roblox_import.txt")).read().split("\n\n", 1)[1])
c0, r0, w, h = meta["crop_pixels"]
with rasterio.open(os.path.join(SITE, meta["source"])) as src:
    z = src.read(1, window=Window(c0, r0, w, h)).astype(np.float64)
    print("raster units:", src.units, "scale:", src.scales, "m/px:", src.res)

# Same terrain as the PNG? They should agree to within one grey level.
png = np.asarray(Image.open(os.path.join(SITE, "ridge_best", "heightmap.png")), dtype=np.float64) / 255
scaled = (z - z.min()) / (z.max() - z.min())
print("elevation range", z.min(), z.max(), "correlation with heightmap.png", np.corrcoef(png.ravel(), scaled.ravel())[0, 1])
print("mean abs difference (m)", np.abs(png - scaled).mean() * (z.max() - z.min()))

(z - z.min()).astype("<f4").tofile(OUT)
print("wrote", OUT, os.path.getsize(OUT))
