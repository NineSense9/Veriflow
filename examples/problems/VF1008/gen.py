import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,15); s=rng.randint(1,40); print(n,s)
print(*[rng.randint(0,10) for _ in range(n)])
