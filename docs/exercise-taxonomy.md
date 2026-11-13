# Spinnin-Up 動作分類規格 v0.1

這份文件定義「如何找動作」，不是要求所有外部候選資料一開始就完整。

## 原則

- 不用單一路徑分類；一個動作同時有多個 facets（篩選面向）。
- 正式動作（approved）欄位要人工或 Agent 審過；外部候選（candidate）可以 unknown，但不能為了填滿而亂猜。
- 外部來源的原始名稱、ID、來源與授權要保留，方便追溯。
- Spinnin-Up 自己的動作圖仍依 AGENTS.md 由工具產生，不直接搬外部圖片。
- 「床上可做」代表在一般穩固床墊上合理可做，不代表所有軟床都適合。
- 臉、頸、姿勢外觀類動作可以收，但效果宣稱要和一般肌力訓練分開處理。

## 核心 facets

### 1. body_regions
- face
- neck
- upper
- core
- lower
- full

### 2. body_parts
沿用或對應 data/areas.json，外部候選可先保留來源肌群名稱。

### 3. movement_pattern
至少支援：
- squat
- hinge
- lunge
- step
- bridge
- calf
- hip_abduction
- hip_adduction
- knee_extension
- pull_horizontal
- pull_vertical
- push_horizontal
- push_vertical
- scap_retraction
- elbow_flexion
- elbow_extension
- carry
- grip
- anti_extension
- anti_rotation
- anti_lateral_flexion
- trunk_flexion
- trunk_rotation
- balance
- locomotion
- mobility
- stretch
- breathing
- facial
- neck_flexion
- neck_extension
- neck_rotation
- neck_lateral_flexion
- other
- unknown

### 4. mode
- hold
- reps
- time
- distance
- breathing
- mixed
- unknown

### 5. positions
可多選：
- standing
- seated
- supine
- prone
- side_lying
- kneeling
- half_kneeling
- quadruped
- plank
- moving
- other
- unknown

### 6. contexts
可多選：
- bed
- floor
- chair
- wall
- desk
- tiny_space
- quiet
- office
- outdoor
- stairs
- park
- travel
- other

### 7. equipment
正式動作仍以 data/equipment.json 為準；候選池保留來源器材名稱並另外做 mapping。

### 8. impact
- none
- low
- moderate
- high
- unknown

### 9. hand_support
- none
- optional
- light
- bodyweight
- unknown

### 10. grip
- none
- optional
- required
- unknown

### 11. overhead
- true
- false
- unknown

### 12. sided
- bilateral
- unilateral
- alternating
- unknown

### 13. balance_demand
- low
- moderate
- high
- unknown

### 14. space
- tiny
- small
- medium
- travel
- unknown

### 15. noise
- quiet
- moderate
- loud
- unknown

## 特殊用途標籤

這些不是動作「本質」，而是使用者會拿來找動作的情境：
- bed_ok
- no_hand_support
- no_floor
- no_jump
- low_noise
- small_space
- one_side_ok
- limited_grip_friendly
- outdoor_move

正式庫中只有確認過才加；candidate 可以只寫 possible_*，不要直接當成已確認。

## Candidate 的信心

外部資料經自動推測時，每個候選要有：
- confidence: high / medium / low
- needs_review: true

例如名稱明寫 Seated → position=seated 可給 high；
只因 equipment=body only 就推測 tiny_space 不成立，不應亂標。

## 三層成熟度

### Raw
外部原始資料或來源快照。保持來源欄位，不改語意。

### Candidate
正規化後可搜尋的候選：
- source
- source_id
- name
- aliases
- category
- source_muscles
- source_equipment
- inferred facets
- source_refs
- confidence
- needs_review

### Approved
真正進 Spinnin-Up data/exercises.json：
- 中文名稱與說明
- 正式 areas/equipment/pattern
- setup/cues/avoid/watch
- dose/sets/rest
- Spinnin-Up 自產圖片
- 經確認的 facets

Candidate 不等於推薦，也不直接顯示給使用者。

## 搜尋例

「躺床上、不要手撐、偏臀腿、安靜」：
- contexts contains bed
- hand_support = none
- body_regions contains lower
- noise = quiet

「人在外面，可以移動」：
- contexts contains outdoor
- positions contains moving
- movement_pattern = locomotion

「只想坐著做、不要躺地」：
- positions contains seated
- contexts contains chair
- contexts not contains floor

## 覆蓋率要看什麼

coverage report 不只算總數，要至少能看：
- context × region
- position × region
- movement_pattern
- hand_support × region
- impact
- equipment
- 特殊缺口：bed / neck / face / foot-ankle / outdoor locomotion / limited grip
