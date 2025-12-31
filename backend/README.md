# Fate GM Helper Backend (Spring Boot)

## 快速启动
1. 环境：JDK 17+、Maven、MySQL (5.7+/8.0)。
2. 创建数据库：
   ```sql
   CREATE DATABASE dev DEFAULT CHARACTER SET utf8mb4;
   ```
3. 配置数据库账号：默认 `application.yml` 使用 `root` / `Aa307764.` / `dev`，若不同请修改：
   `backend/src/main/resources/application.yml`
4. 启动：
   ```bash
   cd backend
   mvn spring-boot:run
   ```
5. 接口示例：
   - POST `http://localhost:8080/api/character-cards`  
   - GET  `http://localhost:8080/api/character-cards/{id}`  
   - GET  `http://localhost:8080/api/character-cards?page=0&size=20`

## 接口请求体示例
```json
{
  "code": "Rider",
  "className": "Rider",
  "rawText": ".st ... 原始文本 ...",
  "totalStats": { "level": 70, "strength": 55, "endurance": 55, "agility": 75, "mana": 95, "luck": 115, "noblePhantasm": 65 },
  "baseStats":  { "level": 70, "strength": 50, "endurance": 50, "agility": 70, "mana": 90, "luck": 110, "noblePhantasm": 0 },
  "correctionStats": { "level": 0, "strength": 5, "endurance": 5, "agility": 5, "mana": 5, "luck": 5, "noblePhantasm": 5 },
  "classSkills": [
    { "name": "对魔力B", "rank": "B", "desc": "..." },
    { "name": "骑乘A", "rank": "A", "desc": "..." }
  ],
  "personalSkills": [
    { "name": "领袖气质A", "rank": "A", "desc": "..." }
  ],
  "noblePhantasms": [
    { "name": "光辉复合大神殿", "rank": "EX", "desc": "..." }
  ]
}
```

## 说明
- 列表字段（职介技能/保有技能/宝具）存为 JSON 列，后续可按需拆表。
- `spring.jpa.hibernate.ddl-auto=update` 已开启，启动时自动建表。
- 已开放 CORS：`http://localhost:5173`（前端 Vite 默认端口）。

