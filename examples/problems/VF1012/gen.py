import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,12); print(n)
for _ in range(n):
    l=rng.randint(0,15); print(l, l+rng.randint(0,6))
