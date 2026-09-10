import math
n,h=map(int,input().split())
t=list(map(int,input().split()))
def ok(v):
    return sum((x+v-1)//v for x in t)<=h
lo,hi=1,max(t)
while lo<hi:
    mid=(lo+hi)//2
    if ok(mid): hi=mid
    else: lo=mid+1
print(lo)
