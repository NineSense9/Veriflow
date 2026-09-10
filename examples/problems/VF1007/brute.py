n,x=map(int,input().split())
a=list(map(int,input().split()))
lo,hi=0,n
while lo<hi:
    mid=(lo+hi)//2
    if a[mid]>=x: hi=mid
    else: lo=mid+1
print(lo+1)
