# Spinnin-Up：居家訓練頁面

正式名稱是 Spinnin-Up。完整的計劃和使用者的期待在私人倉庫 `DaichiaYu/Spin-Up` 的 `plan.md`，兩邊有出入時以那份為準。這個倉庫是公開的，不要放使用者個人的身體狀況。

給接手這個倉庫的 AI 和人看的說明。開始工作前先讀完這份，再讀 `docs/decisions.md`。

## 這是什麼

一個純前端的居家訓練網頁（放在 GitHub Pages）。它先了解使用者的身體條件，排出當天的課表，讓使用者看懂這組練了什麼，帶著做完，再依做完的回饋小幅調整。

使用者（倉庫擁有者）不寫程式，靠 AI 協作開發。跟她說明時用白話的繁體中文，不要丟術語。

## 不能違反的原則

1. **系統提方案，人保留最後決定權。** 課表一定能預覽、刪除、替換、改秒數。
2. **讓使用者看懂。** 每個動作都要說清楚主要在哪裡出力、效果是什麼。
3. **不存使用者資料。** 沒有帳號、沒有後端。身體資料不放進分享連結。
4. **不宣稱能解決身體問題。** 左右不對稱等情況只「提供調整選項」，並提醒以個人狀況為準、有疑慮洽物理治療師。不用「矯正」「治療」「解決」這類字眼。
5. **回報疼痛時是停止，不是調整。**
6. **不用外部圖片。** 動作圖一律由 `tools/build_figures.py` 產生，不從網路或其他 App 取圖。

## 資料夾

```
data/
  areas.json        身體部位詞彙（肌肉 + 關節）
  equipment.json    器材
  exercises.json    動作資料庫（整個產品的核心）
assets/exercises/   動作線稿 SVG（程式產生的，不要手改）
tools/
  build_figures.py  產生線稿
  build_catalog.py  產生 catalog.html
  validate.py       檢查資料有沒有對得上
catalog.html        動作總覽頁（程式產生的，不要手改）
docs/
  decisions.md      已經決定的事、還沒決定的事
  data-format.md    exercises.json 每個欄位的意思
  roadmap.md        分階段要做什麼、做到哪
```

## 改動作資料時

1. 改 `data/exercises.json`。新動作也要在 `tools/build_figures.py` 加姿勢。
2. 依序跑：
   ```
   python3 tools/build_figures.py
   python3 tools/validate.py
   python3 tools/build_catalog.py
   ```
3. **圖一定要實際算出來看過**（例如 `rsvg-convert`），確認姿勢正確、沒有肢體穿到地板下面。不能只看程式碼就當作沒問題。
4. 動作的 `id` 訂了就不要改。之後分享連結會用 `id` 記課表，改了舊連結會壞。要淘汰動作就留著資料、另外標記。

## 內容怎麼寫

- 提示用短句，一句一件事，寫身體上感覺得到的事（「腳跟往下踩」），不寫解剖術語。
- `watch` 是「如果這個地方有感覺，代表什麼、怎麼調」。之後回饋功能會直接用它。
- 能讓左右兩邊做得不一樣的動作，在提示裡寫明「兩邊不一樣是可以的」。
