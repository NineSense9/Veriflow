import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,10); print(n)
for _ in range(n):
    l=rng.randint(0,20); r=l+rng.randint(0,8); print(l,r)
