import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,20); q=rng.randint(1,8)
print(n,q)
print(*[rng.randint(0,10) for _ in range(n)])
for _ in range(q):
    l=rng.randint(1,n); r=rng.randint(l,n); print(l,r)
