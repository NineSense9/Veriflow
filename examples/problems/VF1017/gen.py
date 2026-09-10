import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,6); m=rng.randint(5,15); print(n,m)
for _ in range(n):
    print(rng.randint(1,m), rng.randint(1,10))
