# Veriflow Stress (对拍)

**Goal:** 三栏对拍：生成器 × 暴力 × 选手，最多 50 轮，停在第一条反例。不调模型，不改写提交 AC。

**API:** `GET /api/problems/{id}/kit` 取题包 gen/brute；`POST /api/problems/{id}/stress` 开拍。无暴力解返回 400 `no_brute`。
