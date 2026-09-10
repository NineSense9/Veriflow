import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
n=rng.randint(1,20)
chars=['(',')']
print(''.join(chars[rng.randrange(2)] for _ in range(n)))
