"""
lola_to_roblox.py - turn a NASA LOLA elevation GeoTIFF into a Roblox terrain heightmap.

Input:  a LOLA DEM GeoTIFF with heights in metres, for example the 5 m/pixel
        Connecting Ridge DEM from NASA Goddard's PGDA:
        https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif
        (any DEM you export from NASA Moon Trek, https://trek.nasa.gov/moon/, works too)

Output (in --out folder):
  heightmap.png   8-bit greyscale, darkest = lowest, for Terrain Editor > Import
  colormap.png    hard-edged material colours (flat ground, steep rock, shadow/ice)
  slope.png       preview: white = steep
  <layer>.png     any extra NASA layers you pass with --layer (sunlight, PSR, Earth view)
  roblox_import.txt  the exact Size numbers to type into the Import tool

Install once:  pip install rasterio numpy pillow
Run:           python lola_to_roblox.py Site01_final_adj_5mpp_surf.tif --out ridge
More options:  python lola_to_roblox.py -h

Scale: Roblox reads 1 heightmap pixel as 4 studs. With 5 m pixels that is 1 stud = 1.25 m.
Use --downsample 2 for a 2x bigger area at 1 stud = 2.5 m.
"""
import argparse
import json
import math
import os

import numpy as np
from PIL import Image

try:
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.windows import Window
    from affine import Affine
except ImportError:  # pragma: no cover
    raise SystemExit("Please run:  pip install rasterio numpy pillow")

STUDS_PER_PIXEL = 4   # fixed by Roblox
MAX_PIXELS = 4096     # Roblox import limit per side

# Roblox colormap key (RGB -> terrain material). Check these against the colour table
# on https://create.roblox.com/docs/parts/terrain (Heightmaps and colormaps) and fix
# here if Roblox has changed them. Colours not in the table snap to the nearest one.
MAT_GROUND = (102, 92, 59)    # Ground  - gentle, buildable
MAT_ROCK = (102, 108, 111)    # Rock    - too steep to build
MAT_BASALT = (30, 30, 37)     # Basalt  - permanently shadowed floor
MAT_GLACIER = (101, 176, 234) # Glacier - shadowed AND flat: where the ice drill goes


def slope_degrees(z, pixel_m):
    gy, gx = np.gradient(z, pixel_m)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def to_png(arr, path, lo=None, hi=None):
    a = np.asarray(arr, dtype="float64")
    lo = np.nanmin(a) if lo is None else lo
    hi = np.nanmax(a) if hi is None else hi
    scaled = np.zeros_like(a) if hi <= lo else (a - lo) / (hi - lo)
    img = np.nan_to_num(np.clip(scaled, 0, 1) * 255, nan=0).round().astype("uint8")
    Image.fromarray(img, mode="L").save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dem", help="LOLA DEM GeoTIFF (heights in metres)")
    ap.add_argument("--out", default="roblox_terrain", help="output folder")
    ap.add_argument("--size", type=int, default=512, help="crop size in DEM pixels before downsampling (default 512 = 2.56 km at 5 m/px)")
    ap.add_argument("--center", type=float, nargs=2, metavar=("COL", "ROW"), help="crop centre in DEM pixels (default: middle of the file)")
    ap.add_argument("--center-xy", type=float, nargs=2, metavar=("X", "Y"), help="crop centre in the file's map metres (polar stereographic X Y)")
    ap.add_argument("--downsample", type=int, default=1, help="average N x N pixels into one (bigger area, coarser)")
    ap.add_argument("--exaggeration", type=float, default=1.0, help="stretch heights; 1 = true shape at game scale")
    ap.add_argument("--max-slope", type=float, default=15.0, help="degrees; steeper ground gets the Rock colour (match GridConfig.MaxSlopeDegrees)")
    ap.add_argument("--layer", action="append", default=[], metavar="NAME=PATH",
                    help="extra NASA raster to cut to the same area, e.g. psr=PSR.tif or sun=AVGVISIB.tif. A layer named psr is used for the colormap.")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    with rasterio.open(args.dem) as src:
        pixel_m = abs(src.transform.a)
        if args.center_xy:
            row, col = src.index(*args.center_xy)
        elif args.center:
            col, row = args.center
        else:
            col, row = src.width / 2, src.height / 2
        size = min(args.size, src.width, src.height)
        c0 = int(max(0, min(src.width - size, round(col - size / 2))))
        r0 = int(max(0, min(src.height - size, round(row - size / 2))))
        window = Window(c0, r0, size, size)
        z = src.read(1, window=window, masked=True).astype("float64").filled(np.nan)
        win_transform = src.window_transform(window)
        crs = src.crs

    # Fill small holes with the mean so the import has no pits.
    if np.isnan(z).any():
        z = np.where(np.isnan(z), np.nanmean(z), z)

    n = max(1, args.downsample)
    if n > 1:
        h, w = (z.shape[0] // n) * n, (z.shape[1] // n) * n
        z = z[:h, :w].reshape(h // n, n, w // n, n).mean(axis=(1, 3))
    out_pixel_m = pixel_m * n
    if max(z.shape) > MAX_PIXELS:
        raise SystemExit(f"Output is {z.shape} pixels; Roblox allows {MAX_PIXELS}. Use a smaller --size or bigger --downsample.")

    slope = slope_degrees(z, out_pixel_m)
    zmin, zmax = float(z.min()), float(z.max())
    relief_m = zmax - zmin
    m_per_stud = out_pixel_m / STUDS_PER_PIXEL
    size_x = z.shape[1] * STUDS_PER_PIXEL
    size_z = z.shape[0] * STUDS_PER_PIXEL
    size_y = relief_m / m_per_stud * args.exaggeration

    to_png(z, os.path.join(args.out, "heightmap.png"), zmin, zmax)
    to_png(slope, os.path.join(args.out, "slope.png"), 0, 45)

    # Extra layers resampled onto the same grid.
    layers = {}
    out_transform = win_transform * Affine.scale(n, n)
    for item in args.layer:
        name, _, path = item.partition("=")
        if not os.path.exists(path):
            stem = os.path.splitext(path)[0]
            for ext in (".tif", ".tiff", ".TIF", ".TIFF"):
                if os.path.exists(stem + ext):
                    path = stem + ext  # browsers often save .TIF as .tiff
                    break
            else:
                raise SystemExit(f"Can't find layer file {path}. Check the name in site-data.")
        dst = np.full(z.shape, np.nan, dtype="float64")
        with rasterio.open(path) as lsrc:
            reproject(
                source=rasterio.band(lsrc, 1), destination=dst,
                src_transform=lsrc.transform, src_crs=lsrc.crs, src_nodata=lsrc.nodata,
                dst_transform=out_transform, dst_crs=crs, dst_nodata=np.nan,
                resampling=Resampling.bilinear if name != "psr" else Resampling.nearest,
            )
            # NASA's int16 maps store value = raw * scale + offset (e.g. sunlight 0..1).
            dst = dst * (lsrc.scales[0] or 1.0) + (lsrc.offsets[0] or 0.0)
        layers[name] = dst
        to_png(dst, os.path.join(args.out, f"{name}.png"))

    # Colormap: shadow first, then steepness.
    rgb = np.zeros(z.shape + (3,), dtype="uint8")
    rgb[:] = MAT_GROUND
    steep = slope > args.max_slope
    rgb[steep] = MAT_ROCK
    psr = layers.get("psr")
    if psr is not None:
        shadow = np.nan_to_num(psr) > 0.5
        rgb[shadow] = MAT_BASALT
        rgb[shadow & ~steep] = MAT_GLACIER
    Image.fromarray(rgb, mode="RGB").save(os.path.join(args.out, "colormap.png"))

    info = {
        "source": os.path.basename(args.dem),
        "crop_pixels": [c0, r0, size, size],
        "output_pixels": [z.shape[1], z.shape[0]],
        "metres_per_pixel": out_pixel_m,
        "metres_per_stud": m_per_stud,
        "real_area_km": [round(z.shape[1] * out_pixel_m / 1000, 2), round(z.shape[0] * out_pixel_m / 1000, 2)],
        "elevation_m": [round(zmin, 1), round(zmax, 1)],
        "relief_m": round(relief_m, 1),
        "height_step_m": round(relief_m / 255, 2),
        "buildable_share": round(float((~steep).mean()), 3),
        "mean_slope_deg": round(float(slope.mean()), 1),
        "roblox_size_studs": [size_x, round(size_y, 1), size_z],
        "exaggeration": args.exaggeration,
    }
    for name, arr in layers.items():
        info[f"{name}_min_mean_max"] = [round(float(np.nanmin(arr)), 3), round(float(np.nanmean(arr)), 3), round(float(np.nanmax(arr)), 3)]

    lines = [
        "ROBLOX TERRAIN IMPORT SETTINGS",
        f"Heightmap: heightmap.png   Colormap: colormap.png",
        f"Select tool Size:  X = {size_x}   Y = {size_y:.0f}   Z = {size_z}   (studs)",
        f"Position: centre where you like, e.g. 0, {size_y / 2:.0f}, 0",
        f"Real area: {info['real_area_km'][0]} x {info['real_area_km'][1]} km; 1 stud = {m_per_stud:.2f} m",
        f"Height: {zmin:.0f} m to {zmax:.0f} m ({relief_m:.0f} m relief, x{args.exaggeration} exaggeration)",
        f"Each grey level = {relief_m / 255:.2f} m. Ground flatter than {args.max_slope} deg: {info['buildable_share']:.0%}",
        "If Y is over 1024 studs, use --downsample 2 or a smaller --size.",
        "",
        json.dumps(info, indent=2),
    ]
    with open(os.path.join(args.out, "roblox_import.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines[:8]))


if __name__ == "__main__":
    main()
