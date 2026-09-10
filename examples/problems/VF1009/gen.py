import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,8); h=rng.randint(n,n+10); print(n,h)
print(*[rng.randint(1,20) for _ in range(n)])
