n=int(input())
a=list(map(int,input().split()))
ans=[-1]*n; st=[]
for i in range(n-1,-1,-1):
    while st and st[-1]<=a[i]: st.pop()
    if st: ans[i]=st[-1]
    st.append(a[i])
print(' '.join(map(str,ans)))
