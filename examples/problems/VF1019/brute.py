n,m=map(int,input().split())
a=[list(map(int,input().split())) for _ in range(n)]
dp=[[0]*m for _ in range(n)]
for i in range(n):
    for j in range(m):
        best=0
        if i: best=max(best, dp[i-1][j])
        if j: best=max(best, dp[i][j-1])
        dp[i][j]=best+a[i][j]
print(dp[-1][-1])
