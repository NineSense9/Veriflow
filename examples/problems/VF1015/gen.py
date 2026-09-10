import os, random
rng = random.Random(int(os.environ.get("VF_SEED", "1")))
print(rng.randint(0,100))
