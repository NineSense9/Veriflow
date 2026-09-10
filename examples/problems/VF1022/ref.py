n,m=map(int,input().split())
g=[[] for _ in range(n+1)]
for _ in range(m):
    u,v=map(int,input().split()); g[u].append(v); g[v].append(u)
seen=[False]*(n+1); ans=0
def dfs(u):
    seen[u]=True
    for v in g[u]:
        if not seen[v]: dfs(v)
for i in range(1,n+1):
    if not seen[i]:
        ans+=1; dfs(i)
print(ans)
