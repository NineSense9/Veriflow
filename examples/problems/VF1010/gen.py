import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(2,15); a=sorted(rng.randint(1,20) for _ in range(n)); x=rng.randint(2,40)
print(n,x)
print(*a)
