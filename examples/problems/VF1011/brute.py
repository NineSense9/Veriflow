n=int(input())
seg=[tuple(map(int,input().split())) for _ in range(n)]
seg.sort()
ans=0; cur=-10**18; right=-10**18
for l,r in seg:
    if l>right:
        ans+=1; right=r
    else:
        right=max(right,r)
print(ans)
