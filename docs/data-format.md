# exercises.json 的欄位

| 欄位 | 意思 |
|---|---|
| `id` | 英文代號。訂了就不要改。 |
| `name` / `name_en` | 中文、英文名稱 |
| `category` | `train` 訓練動作、`warmup` 暖身、`cooldown` 收操 |
| `region` | `lower` 下半身、`core` 核心、`upper` 上半身、`full` 全身 |
| `pattern` | 動作類型（蹲、髖鉸鏈、拉、推、抗伸展…）。找替代動作、檢查課表完整性時用。 |
| `mode` | `hold` 撐住算秒數、`reps` 算次數 |
| `primary` | 主要發力的部位。預覽時顯示，也是「應該在哪裡有感覺」。 |
| `secondary` | 會一起用到的部位 |
| `equipment` | 需要的器材，全部都要有才能做 |
| `upper_load` | 手臂的負擔：`none` 不用承重、`light` 輕度出力、`full` 要撐體重。上肢承重不適合的人用這個篩掉動作。 |
| `sided` | `true` 表示左右各做一次，可以兩邊分開設定 |
| `level` | 難度 1–5 |
| `dose` | 預設的量：`unit`（`sec` 或 `reps`）、`default`、`min`、`max`、`step`（每次調整的幅度） |
| `sets` / `rest_sec` | 預設組數、組間休息秒數 |
| `effect` | 一句話說這個動作的效果 |
| `setup` | 怎麼做（步驟） |
| `cues` | 做的時候的提示 |
| `avoid` | 常見的錯誤 |
| `watch` | 「如果這個部位有感覺」的意思和調整方式。`area` 不能和 `primary` 重複。 |
| `easier` / `harder` | 簡單一級、難一級的動作 `id`，沒有就是 `null` |
| `swaps` | 可以替換的動作 |
| `easier_tip` | 不換動作、直接降低難度的方法 |

部位代號在 `areas.json`，器材代號在 `equipment.json`。改完跑 `python3 tools/validate.py`。
