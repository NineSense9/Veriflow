import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,15); q=rng.randint(1,10)
print(n,q)
for _ in range(q):
    l=rng.randint(1,n); r=rng.randint(l,n); print(l,r,rng.randint(-5,5))
