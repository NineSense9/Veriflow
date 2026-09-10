s=input().strip()
st=[]
ok=True
for ch in s:
    if ch=='(':
        st.append(ch)
    elif not st:
        ok=False; break
    else:
        st.pop()
print('Yes' if ok and not st else 'No')
