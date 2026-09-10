import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=1 if rng.random()<0.4 else rng.randint(2,12)
print(n)
print(*[rng.randint(-100,100) for _ in range(n)])
