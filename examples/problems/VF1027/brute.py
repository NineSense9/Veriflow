n=int(input())
if n<2:
    print(0)
else:
    vis=[False]*(n+1); cnt=0
    for i in range(2,n+1):
        if not vis[i]:
            cnt+=1
            for j in range(i*i,n+1,i):
                vis[j]=True
    print(cnt)
