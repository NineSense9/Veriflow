import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,4); m=rng.randint(1,4); print(n,m)
for _ in range(n):
    print(*[rng.randint(0,9) for _ in range(m)])
