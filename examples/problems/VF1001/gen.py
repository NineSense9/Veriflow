import random

rng = random.Random()
kind = rng.randrange(4)
if kind == 0:
    n = 1
    vals = [rng.choice([0, 1, 10**9])]
elif kind == 1:
    n = rng.randint(2, 6)
    vals = [10**9] * n
elif kind == 2:
    n = rng.randint(2, 12)
    dup = rng.randint(0, 40)
    vals = [dup] * n
else:
    n = rng.randint(1, 20)
    vals = [rng.randint(0, 10**9) for _ in range(n)]
print(n)
print(" ".join(str(v) for v in vals))
