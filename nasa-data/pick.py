import os
import numpy as np
from scipy import ndimage
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'stats.py')).read().split("for site in")[0])
for site in ["Site01_final_adj_5mpp_surf.tif","Site06_final_adj_5mpp_surf.tif"]:
    z,sl,o=load(site); px=25e-6
    sunny=(o["sun"]>0.6)&(sl<15); psr=o["psr"]>0.5
    W=512; best=None
    cs=np.cumsum(np.cumsum(np.pad(sunny,((1,0),(1,0))),0),1); cp=np.cumsum(np.cumsum(np.pad(psr,((1,0),(1,0))),0),1)
    box=lambda c,r,k:c[r+W,k+W]-c[r,k+W]-c[r+W,k]+c[r,k]
    H,Wd=z.shape
    for r in range(0,H-W+1,32):
        for k in range(0,Wd-W+1,32):
            a=box(cs,r,k)*px; p=box(cp,r,k)*px
            sc=a+0.15*min(p,0.6)
            if best is None or sc>best[0]: best=(sc,r,k,a,p)
    sc,r,k,a,p=best
    win=(slice(r,r+W),slice(k,k+W))
    print(site[:6],"best window centre col %d row %d: sunny-gentle %.3f km2, PSR %.3f km2, relief %d m, mean sun %.2f max %.2f, earth %.2f, gentle %.2f"%(k+W//2,r+W//2,a,p,z[win].max()-z[win].min(),o['sun'][win].mean(),o['sun'][win].max(),o['earth'][win].mean(),(sl[win]<15).mean()))
