import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,8); print(n,end=' ')
pairs=[]
for _ in range(rng.randint(0,n)):
    a=rng.randint(1,n); b=rng.randint(1,n)
    if a!=b: pairs.append((a,b))
print(len(pairs))
for a,b in pairs: print(a,b)
