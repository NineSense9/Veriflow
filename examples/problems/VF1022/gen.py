import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,8); edges=set()
for _ in range(rng.randint(0,n)):
    u=rng.randint(1,n); v=rng.randint(1,n)
    if u!=v: edges.add(tuple(sorted((u,v))))
print(n,len(edges))
for u,v in edges: print(u,v)
