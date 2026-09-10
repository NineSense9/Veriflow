import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,6); edges=[]
for u in range(1,n):
    if rng.random()<0.6: edges.append((u,u+1))
print(n,len(edges))
for u,v in edges: print(u,v)
