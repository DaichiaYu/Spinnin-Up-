# Exercise library coverage

這是初始盤點；之後執行 `python3 tools/build_exercise_coverage.py` 可由資料重建。候選動作不代表已經可以直接推薦給使用者。

- Approved：28
- External candidates：876（free-exercise-db）
- Candidate movement pattern 尚未判定：308
- 可能床上候選：22
- 頸部候選：9
- 戶外移動候選：13

## Approved：場景

| 項目 | 數量 |
|---|---:|
| quiet | 25 |
| tiny_space | 16 |
| floor | 10 |
| bed | 9 |
| chair | 3 |
| wall | 2 |
| stairs | 1 |

## Approved：姿勢

| 項目 | 數量 |
|---|---:|
| standing | 17 |
| supine | 7 |
| seated | 3 |
| moving | 1 |
| plank | 1 |
| prone | 1 |
| side_lying | 1 |

## Approved：特殊搜尋標籤

| 項目 | 數量 |
|---|---:|
| no_jump | 28 |
| small_space | 27 |
| low_noise | 25 |
| no_hand_support | 13 |
| one_side_ok | 11 |
| bed_ok | 9 |
| limited_grip_friendly | 1 |

## Candidate：movement patterns（初始主要類別）

| 項目 | 數量 |
|---|---:|
| unknown | 308 |
| stretch | 109 |
| elbow_flexion | 70 |
| squat | 56 |
| pull_horizontal | 52 |
| push_horizontal | 48 |
| elbow_extension | 43 |
| hinge | 31 |
| trunk_flexion | 30 |
| pull_vertical | 18 |
| push_vertical | 14 |
| locomotion | 13 |
| calf | 12 |
| trunk_rotation | 12 |
| lunge | 10 |

## 目前明顯缺口

- **臉部**：正式庫 0；不要從一般健身庫硬湊，之後另找有證據脈絡的來源。
- **頸部**：正式庫 0；候選池有少量，可優先人工審。
- **床上**：正式庫已有仰躺／側躺／趴姿動作；外部候選目前只標 `possible_bed_candidate`，升級前要確認床墊穩定性是否影響動作。
- **戶外移動**：正式庫幾乎沒有；候選池有基本走、跑類，後續應補坡道、樓梯、走跑間歇等情境型內容。
- **足踝／足弓**：目前只有零散小腿和平衡動作，缺專門足部控制、活動度與足弓相關內容。
- **limited grip**：正式庫只有少數可不靠手掌抓握的動作，應額外盤點。
- **movement pattern 正規化**：876 筆裡仍有 308 筆 unknown，下一輪應優先改善規則或人工審常見名稱，而不是盲目再加資料源。

## 下一階段怎麼用

先用 facets 查候選 → 人工看來源與動作本身 → 補中文名稱、setup/cues/avoid/watch/dose → 用 Spinnin-Up 自己的圖 → 才升成 approved。

不要以「候選總數」當 KPI；優先補 coverage 缺口。
