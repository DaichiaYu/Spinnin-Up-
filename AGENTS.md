# Spinnin-Up：居家訓練頁面

正式名稱是 Spinnin-Up。完整的計劃和使用者的期待在私人倉庫 `DaichiaYu/Spin-Up` 的 `plan.md`，兩邊有出入時以那份為準。這個倉庫是公開的，不要放使用者個人的身體狀況。

給接手這個倉庫的 AI 和人看的說明。新的工作階段先讀 `project-state.json`，再讀這份、`docs/decisions.md`、`docs/roadmap.md`。需要判斷產品意圖或未決事項時，再去讀私人倉庫 `DaichiaYu/Spin-Up` 的 `plan.md`；不要把 AI 建議自行升格成使用者決定。

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
index.html          網站入口，載入 src/main.js
app.css             網站的樣式
src/
  main.js           啟動：讀資料、讀網址裡的課表；window.__spin 測試入口（不要拿掉）
  workout-engine.js 訓練邏輯：展開步驟、總時間、部位比例、器材、替換建議（不碰畫面）
  routine-code.js   訓練代碼（網址 #r=），舊連結要一直讀得回來（不碰畫面）
  calendar.js       行事曆檔與欄位檢查（不碰畫面）
  player.js         播放器的時間邏輯：步驟、倒數、暫停、背景補進度（不碰畫面、不出聲）
  sound.js          播報模式、音量、提示音、語音
  ui.js             畫面：只負責顯示和收集操作，不放訓練規則
project-state.json  給 Agent 先讀的機器可解析專案狀態
tests/              不可被功能改動破壞的 repository contracts
tests/js/           src/ 邏輯的單元測試（node --test，不用 npm）
.github/workflows/  push / PR 自動驗證
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


## Agent-first 維護流程

每次功能或資料改動完成前，至少跑：

```
python3 -m unittest discover -s tests -v
node --test tests/js/*.test.mjs
python3 tools/validate.py
python3 tools/build_figures.py
python3 tools/build_catalog.py
git diff --exit-code -- assets/exercises catalog.html
```

GitHub Actions 也會跑同一組 guardrails。CI 沒過不要合併，也不要用刪測試或放寬檢查來掩蓋問題；應先確認是產品規則改了，還是真的改壞。

`project-state.json` 只放已確定、適合機器判讀的目前狀態，不取代 `plan.md`。以下情況要同步更新：

- 階段改變
- 功能從 planned / pending 變成 done 或 blocked
- 架構改變（例如加入後端、帳號、框架）
- source of truth 的位置或優先順序改變

如果產品規格、公開文件、程式實作彼此不一致，先回到私人 `Spin-Up/plan.md` 查明意圖，再修正衝突；不要自行挑一份看起來最新的文件當真相。

## 程式放哪裡

- 第 3 階段的「產生課表」規則、左右分開、時間限制、難度調整，都寫在 `src/workout-engine.js`（或在 `src/` 另開不碰畫面的檔案），並在 `tests/js/` 補測試。
- `src/ui.js` 的按鈕事件只呼叫上面這些函式，不要在裡面直接寫訓練規則。
- 改 `src/routine-code.js` 時，`tests/js/routine-code.test.mjs` 裡的舊連結一定要還讀得回來。
