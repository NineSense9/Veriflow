import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,20); a=sorted(rng.randint(0,30) for _ in range(n)); x=rng.randint(0,30)
print(n,x)
print(*a)
