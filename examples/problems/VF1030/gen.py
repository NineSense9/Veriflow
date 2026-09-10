import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,15); x=rng.randint(0,30); print(n,x)
print(*[rng.randint(0,20) for _ in range(n)])
