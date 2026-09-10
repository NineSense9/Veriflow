n,x=map(int,input().split())
a=list(map(int,input().split()))
i,j=0,n-1
ok=False
while i<j:
    s=a[i]+a[j]
    if s==x: ok=True; break
    if s<x: i+=1
    else: j-=1
print('Yes' if ok else 'No')
