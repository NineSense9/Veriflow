import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
letters='ab'
print(''.join(rng.choice(letters) for _ in range(rng.randint(0,6))))
print(''.join(rng.choice(letters) for _ in range(rng.randint(0,6))))
