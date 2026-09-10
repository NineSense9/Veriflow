n=int(input())
a=list(map(int,input().split()))
a.sort()
ans=s=0
for x in a:
    ans+=s; s+=x
print(ans)
