# NapCat 本地接入说明

这里不提交 NapCat 本体，只放本项目需要的接入说明和配置模板。

## 为什么不直接塞 NapCat

- NapCat 是另一个项目，版本会跟 QQ 版本一起变化。
- 登录后的账号数据、token、设备信息不能进 GitHub。
- Git 不适合长期保存大体积二进制文件。

## 推荐目录

把你下载的 NapCat 放在本目录下的 `runtime/` 里：

```text
tools/napcat/runtime/
```

`runtime/` 已被 `.gitignore` 忽略，不会误传登录数据。

## 本项目连接方式

本项目链路是：

```text
NapCat 登录 QQ
→ 提供 OneBot 连接
→ Koishi 的 adapter-onebot 连接 NapCat
→ fate-actions 插件写入 GM Helper 后端
```

Koishi 示例配置在：

```text
my-koishi-bot/koishi.example.yml
```

里面已经预留了 `adapter-onebot` 配置。本机真实 token、QQ 号和连接地址请写到 `my-koishi-bot/koishi.yml`，不要提交。

## 最小启动顺序

1. 双击根目录 `start-desktop.bat`，启动 GM Helper 独立窗口。
2. 启动 NapCat，并登录 QQ。
3. 启动 `my-koishi-bot`。
4. 在 QQ 群里使用 `绑定战役 <战役ID>`。

如果只用网页本地跑团，不接 QQ，可以不启动 NapCat 和 Koishi。
