n,s=map(int,input().split())
a=list(map(int,input().split()))
ans=n+1; left=0; cur=0
for right in range(n):
    cur+=a[right]
    while cur>=s:
        ans=min(ans,right-left+1)
        cur-=a[left]; left+=1
print(ans if ans<=n else -1)
