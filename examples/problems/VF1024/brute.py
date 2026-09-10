import heapq
n,m=map(int,input().split())
g=[[] for _ in range(n+1)]
for _ in range(m):
    u,v,w=map(int,input().split()); g[u].append((v,w)); g[v].append((u,w))
dist=[10**18]*(n+1); dist[1]=0; h=[(0,1)]
while h:
    d,u=heapq.heappop(h)
    if d!=dist[u]: continue
    for v,w in g[u]:
        nd=d+w
        if nd<dist[v]:
            dist[v]=nd; heapq.heappush(h,(nd,v))
print(dist[n] if dist[n]<10**18 else -1)
