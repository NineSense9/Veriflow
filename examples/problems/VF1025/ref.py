n,m=map(int,input().split())
p=list(range(n+1)); sz=[1]*(n+1)
def find(x):
    while p[x]!=x:
        p[x]=p[p[x]]; x=p[x]
    return x
for _ in range(m):
    a,b=map(int,input().split()); x,y=find(a),find(b)
    if x!=y:
        p[y]=x; sz[x]+=sz[y]
print(max(sz[1:]) if n else 0)
