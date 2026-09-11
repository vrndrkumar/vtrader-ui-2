#!/usr/bin/env python3
# Phase 3a: train an EXPORTABLE gradient-boosting model (plain trees, raw
# thresholds) — confirm it still beats v2 walk-forward, then export to JSON the
# TS engine can evaluate with a tiny tree-walker (pure JS, no Python in prod).
import sys, json, numpy as np, pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

CSV = sys.argv[1] if len(sys.argv) > 1 else "research/out/dataset.csv"
df = pd.read_csv(CSV, low_memory=False)
LABELS=["y_R","y_pnl","y_status","y_win","y_mfe","y_mae","y_min"]; ID=["day"]
FEATS=[c for c in df.columns if c not in LABELS+ID]
for c in FEATS+["y_pnl","y_min"]: df[c]=pd.to_numeric(df[c],errors="coerce")
df["y_min"]=df["y_min"].fillna(999)
df["tradeable"]=((df["rejected"]==0)&(df["premium"].notna())).astype(int)
MED = df[FEATS].median(numeric_only=True).fillna(0.0)  # imputation values (shared w/ JS)
Xall = df[FEATS].fillna(MED).fillna(0.0)

days=sorted(df.day.unique()); n=len(days)
bounds=[int(n*f) for f in (0.40,0.52,0.64,0.76,0.88)]+[n]

def mk(): return GradientBoostingRegressor(loss="squared_error",n_estimators=140,
    max_depth=3,learning_rate=0.05,subsample=0.7,min_samples_leaf=80,random_state=0)

def seq(block,col):
    out=[]
    for day,g in block.groupby("day"):
        busy=-1
        for mins,gd in g.groupby("mins"):
            if mins<busy: continue
            c=gd[gd.tradeable==1]
            if len(c)==0: continue
            pk=c.loc[c[col].idxmax()]
            if col=="pred" and pk["pred"]<=0: continue
            out.append(pk["y_pnl"]); busy=mins+(pk["y_min"] if np.isfinite(pk["y_min"]) else 375)
    return np.array([p for p in out if np.isfinite(p)])
def st(p):
    if len(p)==0: return dict(n=0)
    w=p[p>0];l=p[p<=0];eq=np.cumsum(p);dd=float(np.max(np.maximum.accumulate(eq)-eq))
    return dict(n=len(p),win=round(100*len(w)/len(p),1),exp=round(float(p.mean()),2),
        pf=round(float(w.sum()/abs(l.sum())),2) if l.sum()!=0 else 999,net=round(float(p.sum()),1),maxDD=round(dd,1))

M=[];V=[]
for i in range(5):
    tr=df[df.day.isin(days[:bounds[i]])]; te=df[df.day.isin(days[bounds[i]:bounds[i+1]])].copy()
    if len(te)==0: continue
    m=mk(); m.fit(tr[FEATS].fillna(MED).fillna(0.0),tr["y_pnl"])
    te["pred"]=m.predict(te[FEATS].fillna(MED).fillna(0.0))
    pm=seq(te,"pred"); pv=seq(te,"v2score"); M.append(pm); V.append(pv)
    print(f"fold {i+1}: MODEL {st(pm)}  |  v2 {st(pv)}")
M=np.concatenate(M);V=np.concatenate(V)
print("\nPOOLED OOS  MODEL:",st(M))
print("POOLED OOS  v2   :",st(V))

# ── train final on ALL data and export ──────────────────────────────────────
final=mk(); final.fit(Xall,df["y_pnl"])
base=float(np.ravel(final.init_.constant_)[0]); lr=float(final.learning_rate)
trees=[]
for est in final.estimators_[:,0]:
    t=est.tree_
    trees.append(dict(f=t.feature.tolist(), thr=[round(float(x),6) for x in t.threshold],
        l=t.children_left.tolist(), r=t.children_right.tolist(),
        v=[round(float(t.value[i][0][0]),6) for i in range(t.node_count)]))
model=dict(kind="gbr_pnl", features=FEATS, medians=[round(float(MED[f]),6) for f in FEATS],
    base=base, lr=lr, trees=trees, tradeThreshold=0.0, engine="opt-v2.1-features",
    trainedOn=dict(rows=int(len(df)),days=int(n),span=[df.day.min(),df.day.max()]))
json.dump(model, open("research/out/model.json","w"))
print(f"\nexported research/out/model.json  ({len(trees)} trees, {len(FEATS)} features)")
