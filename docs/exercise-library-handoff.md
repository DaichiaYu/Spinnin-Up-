# Exercise Library Foundation — handoff

狀態：foundation ready for review  
分支：`exercise-library-foundation`  
日期：2026-11-13

這一輪的目的不是把幾百個外部動作直接上線，而是讓之後的 Agent 能直接回答「有哪些候選動作符合這個情境」，不用重新上網找分類方法。

## 已完成

### 1. Taxonomy v0.1
- `docs/exercise-taxonomy.md`
- 定義 movement pattern、姿勢、場景、手部支撐、抓握、衝擊、單側、空間、噪音與特殊搜尋標籤。
- 外部 candidate 允許 unknown；approved 不應為了填滿而亂猜。

### 2. 現有正式動作 facets
- `data/exercise-facets.json`
- 28 個 approved 動作全部有情境標籤。
- 初始統計：
  - 床上可做：9
  - 低噪音：25
  - 完全不用手支撐：13
  - small-space：27

### 3. 外部候選池
- `data/exercise-candidates.json`
- 目前 876 筆，來源為 `yuhonas/free-exercise-db`。
- 所有候選都保留 source/source_id/source_url。
- 所有候選都是 `needs_review=true`，不能直接當正式推薦。
- 目前自動分類只是縮小搜尋範圍，不是內容審核。

### 4. 來源與授權
- `research/exercise-sources/sources.json`
- free-exercise-db：Unlicense / public domain，可匯入。
- Kinetic exercises-db：MIT，可作第二來源；目前尚未 bulk import。
- RepDB free tier：只列 reference-only；授權不允許第三方把衍生資料集重新發布，所以不放進公開 candidate pool，也不拿圖片做生成參考。

### 5. 可重跑工具
- `tools/import_free_exercise_db.py`
  - 給本地下載好的 free-exercise-db JSON，重建 candidate pool。
- `tools/validate_exercise_library.py`
  - 檢查 approved facets 和 candidate pool 基本契約。
- `tools/build_exercise_coverage.py`
  - 從 repo 資料重建 coverage report。

### 6. Coverage
- `docs/exercise-coverage.md`

目前明顯缺口：
- 臉部
- 頸部
- 戶外移動（除了基本走／跑）
- 足踝／足弓
- limited grip 情境
- candidate movement pattern 還有大量 unknown

## 為什麼先停在這裡

這時候後續 Agent 已經可以：
1. 先查 approved facets。
2. 不夠再查 876 筆 candidate。
3. 看到來源與授權。
4. 知道哪些分類只是自動推測。
5. 按 coverage 缺口決定下一批要審什麼。

不需要再重新研究「床上運動算什麼分類」「情境要怎麼存」「外部資料能不能直接搬」。

## 下一輪建議順序

### A. 先提高 candidate 正規化品質
- 優先處理最常見的 `movement_pattern=unknown`。
- 不要為了 unknown 歸零而硬分類。
- 可用 Kinetic 作第二來源交叉補 metadata，但保留各來源 provenance。

### B. 按使用情境審核小批次
建議一次 10–30 個，不要一次審 800 個。

優先批次：
1. bed
2. neck
3. outdoor locomotion
4. foot / ankle / arch
5. limited grip

### C. 臉部另開研究路線
臉部運動不要從一般健身資料庫硬套。
要把「可做的臉／下顎／頸部活動」和「瘦臉、拉提、消紋」等效果宣稱分開，先查證據再決定哪些能進正式庫。

### D. 升級成 approved 的流程
候選 → 看原始來源 → 確認動作本身 → 寫 Spinnin-Up 中文內容 → 定 dose / level / watch → 產生自己的 SVG → validate / tests → 才進 `data/exercises.json`。

## 不要做

- 不要把 `exercise-candidates.json` 直接接到使用者 UI。
- 不要直接複製外部圖片進正式庫。
- 不要用候選總數當 KPI。
- 不要把 `possible_bed_candidate` 當成已確認 bed_ok。
- 不要把 RepDB 再發布成衍生資料集。
- 不要因為資料庫有某個動作就假設它適合所有人。

## 大檔案提醒

`data/exercise-candidates.json` 超過 1 MB，對話中的 GitHub connector 可能讀回截斷。
Agent 不應嘗試把整份檔案塞進 context；應使用 repo 內工具、搜尋或局部處理。
