x=int(input())
ans=0
for c in (25,10,5,1):
    ans+=x//c; x%=c
print(ans)
