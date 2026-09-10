import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,15)
print(n)
print(*[rng.randint(-10,10) for _ in range(n)])
