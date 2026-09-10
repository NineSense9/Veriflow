n,q=map(int,input().split())
d=[0]*(n+2)
for _ in range(q):
    l,r,x=map(int,input().split())
    d[l]+=x; d[r+1]-=x
cur=0
out=[]
for i in range(1,n+1):
    cur+=d[i]; out.append(str(cur))
print(' '.join(out))
