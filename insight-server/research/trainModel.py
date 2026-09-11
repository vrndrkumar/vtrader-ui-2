#!/usr/bin/env python3
# Phase 2: train an expected-P&L model on the candidate dataset and evaluate it
# WALK-FORWARD (train past -> test future, rolling), with a realistic one-
# position-at-a-time OOS simulation, benchmarked against v2's own ranking.
import sys, json, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

CSV = sys.argv[1] if len(sys.argv) > 1 else "research/out/dataset.csv"
df = pd.read_csv(CSV, low_memory=False)
print(f"rows={len(df)}  days={df.day.nunique()}  span={df.day.min()}..{df.day.max()}")

LABELS = ["y_R","y_pnl","y_status","y_win","y_mfe","y_mae","y_min"]
ID = ["day"]
FEATS = [c for c in df.columns if c not in LABELS+ID]
for c in FEATS+["y_pnl","y_R","y_min"]:
    df[c] = pd.to_numeric(df[c], errors="coerce")
df["y_min"] = df["y_min"].fillna(999)

# tradeable = the candidates v2 would actually consider (not vetoed, has premium)
df["tradeable"] = ((df["rejected"]==0) & (df["premium"].notna())).astype(int)

days = sorted(df.day.unique())
n = len(days)
# expanding walk-forward: initial 40% train, then 5 rolling test blocks
starts = [int(n*f) for f in (0.40,0.52,0.64,0.76,0.88)]
bounds = starts + [n]

def sequence_trades(block, score_col):
    """one-position-at-a-time per day: at each decision (in time order) if flat,
    take the tradeable candidate with max score_col; hold until it resolves
    (mins+y_min); realize its actual y_pnl. Returns list of pnls."""
    pnls=[]
    for day, g in block.groupby("day"):
        busy_until=-1
        for mins, gd in g.groupby("mins"):
            if mins < busy_until: continue
            cand = gd[gd.tradeable==1]
            if len(cand)==0: continue
            pick = cand.loc[cand[score_col].idxmax()]
            if score_col=="pred" and pick["pred"]<=0:   # model may sit out
                continue
            pnls.append(pick["y_pnl"])
            busy_until = mins + (pick["y_min"] if np.isfinite(pick["y_min"]) else 375)
    return np.array([p for p in pnls if np.isfinite(p)])

def stats(p):
    if len(p)==0: return dict(n=0)
    w=p[p>0]; l=p[p<=0]
    eq=np.cumsum(p); dd=float(np.max(np.maximum.accumulate(eq)-eq)) if len(eq) else 0
    return dict(n=len(p), win=round(100*len(w)/len(p),1), exp=round(p.mean(),2),
                pf=round(w.sum()/abs(l.sum()),2) if l.sum()!=0 else 999,
                net=round(p.sum(),1), maxDD=round(dd,1))

allM=[]; allV=[]; imp=None
for i in range(5):
    tr = df[df.day.isin(days[:bounds[i]])]
    te = df[df.day.isin(days[bounds[i]:bounds[i+1]])]
    if len(te)==0: continue
    Xtr, ytr = tr[FEATS], tr["y_pnl"]
    m = HistGradientBoostingRegressor(max_depth=4, learning_rate=0.05,
        max_iter=400, l2_regularization=1.0, min_samples_leaf=80,
        validation_fraction=0.15, early_stopping=True, random_state=0)
    m.fit(Xtr, ytr)
    te = te.copy(); te["pred"] = m.predict(te[FEATS])
    pm = sequence_trades(te, "pred"); pv = sequence_trades(te, "v2score")
    allM.append(pm); allV.append(pv)
    print(f"\nfold {i+1}: train {days[:bounds[i]][0]}..{days[bounds[i]-1]} ({len(tr)}r) "
          f"-> test {days[bounds[i]]}..{days[bounds[i+1]-1]} ({len(te)}r)")
    print(f"   MODEL {stats(pm)}")
    print(f"   v2    {stats(pv)}")

M=np.concatenate(allM) if allM else np.array([]); V=np.concatenate(allV) if allV else np.array([])
print("\n════════ POOLED OUT-OF-SAMPLE (all folds) ════════")
print("MODEL (pick max predicted P&L, sit out if ≤0):", stats(M))
print("v2    (pick max v2 score):                    ", stats(V))

# feature importance via permutation on the last fold's test (quick, indicative)
from sklearn.inspection import permutation_importance
try:
    pi = permutation_importance(m, te[FEATS].fillna(0), te["y_pnl"], n_repeats=3, random_state=0, n_jobs=-1)
    order=np.argsort(pi.importances_mean)[::-1][:15]
    print("\nTop features (permutation importance, last fold):")
    for j in order: print(f"   {FEATS[j]:12s} {pi.importances_mean[j]:.3f}")
except Exception as e:
    print("importance skipped:", e)

json.dump({"model":stats(M),"v2":stats(V)}, open("research/out/model-eval.json","w"), indent=2)
print("\nsaved research/out/model-eval.json")
