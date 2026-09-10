import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,12); print(n)
print(*[rng.randint(1,20) for _ in range(n)])
