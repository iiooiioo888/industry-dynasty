# 部署

`industry-dynasty` 的遊戲邏輯全部跑在瀏覽器裡（`packages/sim` 是純規則、
`apps/web` 是 Vite 靜態站），所以部署就是**把 `apps/web/dist` 放到任何靜態伺服器**。
`apps/server` 目前只是 intent stub（HTTP/WS 尚未接線），部署不需要它。

## 快速開始（Windows，一條指令）

```powershell
# 1. 建立本機設定（非機密）
Copy-Item deploy\target.env.example .deploy\target.env
notepad .deploy\target.env      # 填 HOST、USER_NAME；有 Docker 就把 USE_DOCKER 設 1

# 2. 把 SSH 密碼寫進檔案（單一行，不要有結尾換行以外的內容）
notepad .deploy\pw

# 3. 先看它要做什麼
powershell -File deploy\server-deploy.ps1 -DryRun

# 4. 真的部署
powershell -File deploy\server-deploy.ps1
```

`.deploy/` 在 `.gitignore` 內，設定與密碼不會被提交。

## 認證方式

腳本用 OpenSSH 的 `SSH_ASKPASS` 機制（需要 OpenSSH 8.4+），把 `.deploy/pw`
餵給 `ssh`／`scp`，所以**密碼不會出現在命令列、也不會進 shell 歷史**。

若你想改用金鑰（更安全，也不受密碼輪替影響）：

```powershell
ssh-keygen -t ed25519 -f .deploy\id_ed25519 -N '""'
# 把 .deploy\id_ed25519.pub 的內容加到伺服器 ~/.ssh/authorized_keys
```

然後在 `.deploy/target.env` 之外，把腳本第 4 段的 askpass 改成使用金鑰
（或直接 `ssh -i .deploy\id_ed25519 ...`）。

## 兩種服務模式

| `USE_DOCKER` | 行為 | 適用 |
| --- | --- | --- |
| `0`（預設） | 只把檔案解到 `REMOTE_DIR`，並印出可直接貼上的 nginx 設定 | 伺服器已有 nginx／Caddy |
| `1` | 遠端 `docker run` 一個 `nginx:1.27-alpine`，把目錄唯讀掛進去 | 伺服器有 Docker |

Docker 模式會建立（或重建）名為 `industry-dynasty-web` 的容器，
`--restart unless-stopped`，對外埠由 `SITE_PORT` 決定。

## 為什麼不用 repo 裡的 Dockerfile

`Dockerfile` 是**建置用**的（node → nginx 多階段），適合在有 Docker 的
機器上 `docker build` 出映像。腳本走的是「本機建置、只上傳靜態檔」，
這樣伺服器不需要 Node／pnpm，也不需要拉建置映像，部署時間短很多。

兩者可以並存：

```bash
docker compose up -d --build      # 本機或伺服器自己建
```

## 驗證部署結果

```bash
curl -I http://<host>/                     # 應為 200
curl -s http://<host>/ | head -20          # 應含 <div id="root">
```

單頁應用的 `try_files` 很重要：直接開 `/any/route` 也要回 `index.html`，
否則重新整理會 404。`USE_DOCKER=0` 印出的 nginx 設定已包含這一行。
