import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from scipy import ndimage
import os
D=os.path.dirname(os.path.abspath(__file__))+"/"
def load(site):
    with rasterio.open(D+site) as s: z=s.read(1).astype(float); T=s.transform; crs=s.crs
    z=np.where(np.isnan(z),np.nanmean(z),z); gy,gx=np.gradient(z,5.0); sl=np.degrees(np.arctan(np.hypot(gx,gy)))
    out={}
    for k,f in {"psr":"LPSR_85S_060M_201608.tiff","sun":"AVGVISIB_85S_060M_201608.tiff","earth":"AVGVISIB_85S_060M_201608_EARTH.tiff"}.items():
        d=np.full(z.shape,np.nan)
        with rasterio.open(D+f) as l:
            reproject(rasterio.band(l,1),d,src_transform=l.transform,src_crs=l.crs,src_nodata=l.nodata,dst_transform=T,dst_crs=crs,dst_nodata=np.nan,resampling=Resampling.nearest if k=="psr" else Resampling.bilinear)
            sc,of=l.scales[0],l.offsets[0]
        out[k]=np.nan_to_num(d*sc+of)
    return z,sl,out
for site in ["Site01_final_adj_5mpp_surf.tif","Site06_final_adj_5mpp_surf.tif"]:
    z,sl,o=load(site); px=25e-6
    for th in (0.6,0.7,0.8):
        m=(o["sun"]>th)&(sl<15)
        lab,n=ndimage.label(m); sizes=ndimage.sum(m,lab,range(1,n+1)) if n else [0]
        print(site[:6],"sun>%.1f & gentle: %.2f km2, biggest patch %.3f km2"%(th,m.sum()*px,max(sizes)*px))
    psr=o["psr"]>0.5; lab,n=ndimage.label(psr); sizes=ndimage.sum(psr,lab,range(1,n+1))
    print(site[:6],"PSR total %.2f km2, patches %d, biggest %.3f km2"%(psr.sum()*px,n,max(sizes)*px))
    # distance from sunny gentle (>0.7) to nearest PSR
    m=(o["sun"]>0.7)&(sl<15)
    dist=ndimage.distance_transform_edt(~psr)*5
    if m.any(): print(site[:6],"distance sunny-gentle(>0.7) to nearest PSR: min %.0f m median %.0f m"%(dist[m].min(),np.median(dist[m])))
    print(site[:6],"earth on sunny-gentle(>0.7): %.2f"%(o['earth'][m].mean() if m.any() else -1))
