n,x=map(int,input().split())
a=list(map(int,input().split()))
seen=set(); ok=False
for v in a:
    if x-v in seen:
        ok=True; break
    seen.add(v)
print('Yes' if ok else 'No')
