import heapq
n,m=map(int,input().split())
g=[[] for _ in range(n+1)]; indeg=[0]*(n+1)
for _ in range(m):
    u,v=map(int,input().split()); g[u].append(v); indeg[v]+=1
h=[i for i in range(1,n+1) if indeg[i]==0]
heapq.heapify(h); order=[]
while h:
    u=heapq.heappop(h); order.append(u)
    for v in g[u]:
        indeg[v]-=1
        if indeg[v]==0: heapq.heappush(h,v)
print(' '.join(map(str,order)) if len(order)==n else -1)
