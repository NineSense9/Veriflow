n=int(input())
seg=[tuple(map(int,input().split())) for _ in range(n)]
seg.sort(key=lambda x:x[1])
ans=0; last=-10**18
for l,r in seg:
    if l>last:
        ans+=1; last=r
print(ans)
